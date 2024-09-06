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

    # Create the videos table if it doesn't exist
    cur.execute('''
        CREATE TABLE IF NOT EXISTS videos (
            id SERIAL PRIMARY KEY,
            user_name TEXT NOT NULL,
            user_pic TEXT,
            url TEXT NOT NULL,
            showcase_url TEXT,
            likes TEXT DEFAULT '0:0',
            comments TEXT DEFAULT '0:0'
        )
    ''')
    conn.commit()

    # Insert the video data into the database
    for video in video_data:
        try:
            user_name = video.get('userName', None)  # Retrieve the userName
            user_pic = video.get('userPic', '')      # Retrieve the userPic (description-like field)
            url = video.get('url', None)             # Retrieve the video URL
            showcase_url = video.get('showcase_url', '')  # Retrieve the showcase URL

            # If userName or url is missing, raise an error
            if user_name is None or url is None:
                raise KeyError("Missing required 'userName' or 'url' field")

            # Insert the data into the database
            cur.execute('''
                INSERT INTO videos (user_name, user_pic, url, showcase_url, likes, comments)
                VALUES (%s, %s, %s, %s, %s, %s)
            ''', (user_name, user_pic, url, showcase_url, video['likes'], video['comments']))

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
            WHERE user_name ILIKE %s OR user_pic ILIKE %s
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
                "user_name": video[1],
                "user_pic": video[2],
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

    # Fetch current likes
    cur.execute('SELECT likes FROM videos WHERE id = %s', (video_id,))
    result = cur.fetchone()

    if result:
        likes = result[0]
        valid_likes, invalid_likes = map(int, likes.split(':'))

        # Increment likes based on account validity
        if is_valid:
            valid_likes += 1
        else:
            invalid_likes += 1

        new_likes = f"{valid_likes}:{invalid_likes}"

        # Update the likes in the database
        cur.execute('UPDATE videos SET likes = %s WHERE id = %s', (new_likes, video_id))
        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Likes updated successfully", "likes": new_likes})
    else:
        cur.close()
        conn.close()
        return jsonify({"error": "Video not found"}), 404

# Endpoint to update comments
@app.route('/videos/<int:video_id>/comments', methods=['POST'])
def update_comments(video_id):
    data = request.get_json()
    account_number = data.get('account_number', '000000')  # Get account number from JSON payload
    is_valid = account_number != '000000'

    conn = get_db_connection()
    cur = conn.cursor()

    # Fetch current comments
    cur.execute('SELECT comments FROM videos WHERE id = %s', (video_id,))
    result = cur.fetchone()

    if result:
        comments = result[0]
        valid_comments, invalid_comments = map(int, comments.split(':'))

        # Increment comments based on account validity
        if is_valid:
            valid_comments += 1
        else:
            invalid_comments += 1

        new_comments = f"{valid_comments}:{invalid_comments}"

        # Update the comments in the database
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
    app.run(port=7000, debug=True)

