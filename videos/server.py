from flask import Flask, request, jsonify
import psycopg2
import sys

app = Flask(__name__)

# PostgreSQL database connection
def get_db_connection():
    conn = psycopg2.connect(
        host="localhost", port=6333,
        database="video_db",
        user="user",
        password="password"
    )
    return conn

# Function to parse URLs
def parse_url(url):
    return url.rsplit('/', 1)[-1]

# Load initial video data into the database
def load_video_data():
    with open('video_data.txt', 'r') as file:
        video_data = [line.strip().split(maxsplit=1) for line in file if line.strip()]

    conn = get_db_connection()
    cur = conn.cursor()

    # Drop and recreate the videos table to ensure fresh data
    cur.execute('DROP TABLE IF EXISTS videos')
    conn.commit()

    # Create the videos table
    cur.execute('''
        CREATE TABLE IF NOT EXISTS videos (
            id SERIAL PRIMARY KEY,
            video_key TEXT NOT NULL UNIQUE,
            host TEXT
        )
    ''')
    conn.commit()

    # Insert video data into the database
    for row in video_data:
        if len(row) < 1:
            print(f"Skipping invalid row: {row}")
            continue
        
        links = row[0]
        host = row[1] if len(row) > 1 else None
        video_keys = [parse_url(link) for link in links.split(':')]
        sorted_video_key = ':'.join(sorted(video_keys))
        
        try:
            cur.execute('''
                INSERT INTO videos (video_key, host)
                VALUES (%s, %s)
            ''', (sorted_video_key, host))
        except psycopg2.IntegrityError:
            conn.rollback()
            print(f"Skipping duplicate entry: {sorted_video_key}")
    
    conn.commit()
    cur.close()
    conn.close()

@app.route('/lookup/<string:search_key>', methods=['GET'])
def lookup_video(search_key):
    conn = get_db_connection()
    cur = conn.cursor()
    sorted_search_key = ':'.join(sorted(search_key.split(':')))
    
    cur.execute('SELECT * FROM videos WHERE video_key = %s', (sorted_search_key,))
    video = cur.fetchone()
    
    cur.close()
    conn.close()

    if not video:
        return jsonify({"error": "Video not found"}), 404
    
    response = {
        "id": video[0],
        "video_key": video[1],
        "host": video[2]
    }
    
    return jsonify(response)

@app.route('/add', methods=['POST'])
def add_video():
    data = request.get_json()
    video_keys = [parse_url(link) for link in data.get('video_key', '').split(':')]
    sorted_video_key = ':'.join(sorted(video_keys))
    host = data.get('host', None)
    
    if not sorted_video_key:
        return jsonify({"error": "Invalid data"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute('''
            INSERT INTO videos (video_key, host)
            VALUES (%s, %s)
        ''', (sorted_video_key, host))
        conn.commit()
    except psycopg2.IntegrityError:
        conn.rollback()
        return jsonify({"error": "Duplicate entry"}), 400
    
    cur.close()
    conn.close()
    
    return jsonify({"message": "Video added successfully"}), 201

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1].lower() == "wipe":
        print("Wiping database and loading video data...")
        load_video_data()
    else:
        print("Skipping database initialization.")
    
    app.run(host="0.0.0.0", port=7001, debug=True)

