from flask import Flask, request, jsonify
import json

app = Flask(__name__)

# Load video data from file
def load_video_data():
    with open('video_data.json', 'r') as file:
        return json.load(file)

@app.route('/videos', methods=['GET'])
def get_videos():
    # Load video data
    video_data = load_video_data()

    # Get pagination query parameters
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 10))

    # Calculate start and end indexes for slicing the data
    start = (page - 1) * limit
    end = start + limit

    # Slice the data to return the correct page of results
    paginated_videos = video_data[start:end]

    # Construct response
    response = {
        "page": page,
        "limit": limit,
        "total_videos": len(video_data),
        "videos": paginated_videos
    }

    return jsonify(response)

if __name__ == '__main__':
    app.run(port=7000,debug=True)

