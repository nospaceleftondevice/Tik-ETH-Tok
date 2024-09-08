from flask import Flask, request, jsonify
import psycopg2
import json

app = Flask(__name__)

# PostgreSQL database connection
def get_db_connection():
    conn = psycopg2.connect(
        host="localhost",
        database="video_db",
        user="user",
        password="password"
    )
    return conn

# Load initial video data into the database
def load_video_data():
    with open('video_data.json', 'r') as file:
        video_data = json.load(file)

    conn = get_db_connection()
    cur = conn.cursor()

    # Drop the user_interactions table first due to foreign key dependency
    cur.execute('DROP TABLE IF EXISTS user_interactions')
    conn.commit()

    # Drop and recreate the videos table to ensure fresh data
    cur.execute('DROP TABLE IF EXISTS videos')
    conn.commit()

    # Create the videos table
    cur.execute('''
        CREATE TABLE IF NOT EXISTS videos (
            id SERIAL PRIMARY KEY,
            userName TEXT NOT NULL,
            userPic TEXT,
            url TEXT NOT NULL,
            showcase_url TEXT,
            likes TEXT DEFAULT '0:0',
            comments TEXT DEFAULT '0:0'
        )
    ''')
    conn.commit()

    # Create a table to track user interactions (for likes and comments)
    cur.execute('''
        CREATE TABLE IF NOT EXISTS user_interactions (
            id SERIAL PRIMARY KEY,
            account_number TEXT NOT NULL,
            video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
            has_liked BOOLEAN DEFAULT FALSE,
            has_commented BOOLEAN DEFAULT FALSE,
            UNIQUE(account_number, video_id)
        )
    ''')
    conn.commit()

    # Insert video data into the database
    for video in video_data:
        try:
            userName = video.get('userName', None)
            userPic = video.get('userPic', '')
            url = video.get('url', None)
            showcase_url = video.get('showcase_url', '')

            if userName is None or url is None:
                raise KeyError("Missing required 'userName' or 'url' field")

            cur.execute('''
                INSERT INTO videos (userName, userPic, url, showcase_url, likes, comments)
                VALUES (%s, %s, %s, %s, %s, %s)
            ''', (userName, userPic, url, showcase_url, video['likes'], video['comments']))

        except KeyError as e:
            print(f"Error inserting video data: {e}. Video data: {video}")
            continue

    conn.commit()
    cur.close()
    conn.close()

# Route to get paginated video data with optional search
@app.route('/videos', methods=['GET'])
def get_videos():
    conn = get_db_connection()
    cur = conn.cursor()

    # Get pagination and search query parameters
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 10))
    search = request.args.get('search', '')  # Get search query

    offset = (page - 1) * limit

    if search:
        search_query = f"%{search}%"
        cur.execute('''
            SELECT * FROM videos 
            WHERE userName ILIKE %s OR userPic ILIKE %s
            LIMIT %s OFFSET %s
        ''', (search_query, search_query, limit, offset))
    else:
        cur.execute('SELECT * FROM videos LIMIT %s OFFSET %s', (limit, offset))

    videos = cur.fetchall()

    cur.execute('SELECT COUNT(*) FROM videos')
    total_videos = cur.fetchone()[0]

    cur.close()
    conn.close()

    # Construct response
    response = {
        "page": page,
        "limit": limit,
        "total_videos": total_videos,
        "videos": [
            {
                "id": video[0],
                "userName": video[1],
                "userPic": video[2],
                "url": video[3],
                "showcase_url": video[4],
                "likes": video[5],
                "comments": video[6]
            }
            for video in videos
        ]
    }

    return jsonify(response)

# Endpoint to update likes
@app.route('/videos/<int:video_id>/likes', methods=['POST'])
def update_likes(video_id):
    data = request.get_json()
    account_number = data.get('account_number', '000000')  # Get account number from JSON payload
    is_valid = account_number != '000000'

    conn = get_db_connection()
    cur = conn.cursor()

    # Fetch current likes for the video
    cur.execute('SELECT likes FROM videos WHERE id = %s', (video_id,))
    result = cur.fetchone()

    if result:
        likes = result[0]
        invalid_likes, valid_likes = map(int, likes.split(':'))

        # If the user is valid, check if they have already liked the video
        if is_valid:
            cur.execute('SELECT has_liked FROM user_interactions WHERE account_number = %s AND video_id = %s', (account_number, video_id))
            interaction = cur.fetchone()

            if interaction and interaction[0]:  # User has already liked the video
                return jsonify({"message": "User has already liked this video"}), 400

            # Increment valid likes
            valid_likes += 1

            # Insert or update user interaction
            cur.execute('''
                INSERT INTO user_interactions (account_number, video_id, has_liked)
                VALUES (%s, %s, TRUE)
                ON CONFLICT (account_number, video_id) 
                DO UPDATE SET has_liked = TRUE
            ''', (account_number, video_id))
        else:
            # For '000000' users, we allow unlimited likes
            invalid_likes += 1

        # Update the likes count in the database
        new_likes = f"{invalid_likes}:{valid_likes}"
        cur.execute('UPDATE videos SET likes = %s WHERE id = %s', (new_likes, video_id))
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({"message": "Likes updated successfully", "likes": new_likes})
    else:
        cur.close()
        conn.close()
        return jsonify({"error": "Video not found"}), 404

@app.route('/videos/<int:video_id>/comments', methods=['POST'])
def update_comments(video_id):
    data = request.get_json()
    account_number = data.get('account_number', '000000')  # Get account number from JSON payload
    is_valid = account_number != '000000'

    conn = get_db_connection()
    cur = conn.cursor()

    # Fetch current comments for the video
    cur.execute('SELECT comments FROM videos WHERE id = %s', (video_id,))
    result = cur.fetchone()

    if result:
        comments = result[0]
        invalid_comments, valid_comments = map(int, comments.split(':'))

        # If the user is valid, check if they have already commented on the video
        if is_valid:
            cur.execute('SELECT has_commented FROM user_interactions WHERE account_number = %s AND video_id = %s', (account_number, video_id))
            interaction = cur.fetchone()

            if interaction and interaction[0]:  # User has already commented on the video
                return jsonify({"message": "User has already commented on this video"}), 400

            # Increment valid comments
            valid_comments += 1

            # Insert or update user interaction
            cur.execute('''
                INSERT INTO user_interactions (account_number, video_id, has_commented)
                VALUES (%s, %s, TRUE)
                ON CONFLICT (account_number, video_id)
                DO UPDATE SET has_commented = TRUE
            ''', (account_number, video_id))
        else:
            # For '000000' users, we allow unlimited comments
            invalid_comments += 1

        # Update the comments count in the database
        new_comments = f"{invalid_comments}:{valid_comments}"
        cur.execute('UPDATE videos SET comments = %s WHERE id = %s', (new_comments, video_id))
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({"message": "Comments updated successfully", "comments": new_comments})
    else:
        cur.close()
        conn.close()
        return jsonify({"error": "Video not found"}), 404


if __name__ == '__main__':
    load_video_data()  # Load data into PostgreSQL when the app starts
    app.run(host="0.0.0.0", port=7000, debug=True)

