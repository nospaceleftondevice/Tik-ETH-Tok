import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})
export class DataService {

    constructor(private http: HttpClient) {}

    // Method to get the list of videos with pagination
    getVideoList(page: number = 1, limit: number = 10): Observable<any[]> {
        console.log("Protocol: " + window.location.protocol);
        if (window.location.protocol === 'https:') {
            var protocol = window.location.protocol; // 'https:'
            var host = window.location.hostname;
            var url = protocol + '//' + host;
            const apiUrl = `${url}/videos?page=${page}&limit=${limit}`;
    
            return this.http.get<any>(apiUrl).pipe(
                map((response: any) => {
                    console.log(`Response: ${response}`);
                    console.dir(response.videos);
                    const videos = response.videos || [];
                    const video_map = videos.map(video => ({
                        userName: video.userName || '',
                        likes: video.likes || '0',
                        comments: video.comments || '0',
                        url: video.url || '',
                        userPic: video.userPic || '',
                        showcase_url: video.showcase_url || '',
                        id: video.id || '',
                    }));
                    console.dir(video_map);
                    return video_map;
                })
            );
        } else {
            // Hardcoded video list for non-https protocol
            const videoList = [
                {
                    id: '1',
                    userName: 'balexand',
                    likes: '1344:1040',
                    comments: '2040089:1400493',
                    url: 'https://stream.mux.com/DeKMk02eVhDvdqKxbchkZ38VDrQo312701pDqXpgrJzkc/high.mp4',
                    userPic: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                    showcase_url: 'https://ethglobal.b-cdn.net/projects/s5fha/banner/default.jpg',
                },
                {
                    id: '2',
                    userName: 'userName2',
                    likes: '0:0',
                    comments: '10:10',
                    url: 'https://firebasestorage.googleapis.com/v0/b/testvideo-91d3a.appspot.com/o/1.mp4?alt=media&token=36032747-7815-473d-beef-061098f08c18',
                    userPic: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                    showcase_url: 'https://ethglobal.com/showcase/flexpay-1yt8q',
                }
                // Add more video entries as needed
            ];

            return of(videoList); // Return an Observable of the hardcoded list
        }
    }

    // New method to perform a video search
    searchVideos(params: { search: string, page: number, limit: number }): Observable<any> {
        const { search, page, limit } = params;
        const protocol = window.location.protocol;
        const host = window.location.hostname;
        const apiUrl = `${protocol}//${host}/videos?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}`;

        return this.http.get<any>(apiUrl).pipe(
            map((response: any) => {
                console.log(`searchVideos: Response: ${response}`);
                console.log(`searchVideos: Number of Response(s): ${response.length}`);
                console.dir(response);
            
                const videos = response.videos || [];
            
                // If there are no results, remove 'videoResults' from sessionStorage
                if (videos.length === 0) {
                    window.sessionStorage.removeItem('videoResults');
                    console.log('No results found, videoResults removed from sessionStorage');
                } else {
                    // Process the videos and store them in sessionStorage
                    const processedVideos = videos.map(video => ({
                        userName: video.userName || '',
                        likes: video.likes || '0',
                        comments: video.comments || '0',
                        url: video.url || '',
                        userPic: video.userPic || '',
                        showcase_url: video.showcase_url || '',
                        id: video.id || '',
                    }));
                
                    // Store the processed video array in sessionStorage as a JSON string
                    window.sessionStorage.setItem('videoResults', JSON.stringify(processedVideos));
                    console.log('Results stored in sessionStorage');
                }

                return videos;
            })
        );
    }
/*
    getVideo(id: string): Observable<any> {
        console.log("********************************************************************");
        console.log(id);
        console.log("********************************************************************");
        const protocol = window.location.protocol;
        const host = window.location.hostname;
        const apiUrl = `${protocol}//${host}/video/${id}`;
        console.log("********************************************************************");
        console.log(apiUrl);
        console.log("********************************************************************");

        return this.http.get<any>(apiUrl).pipe(
            map((response: any) => {
                console.log(`getVideo: Video Response: ${response}`);
                console.dir(response); 
                console.log(`getVideo: Number of Response(s): ${response.length}`);
                const video = {
                    userName: response.userName || '',
                    likes: response.likes || '0',
                    comments: response.comments || '0',
                    url: response.url || '',
                    userPic: response.userPic || '',
                    showcase_url: response.showcase_url || '',
                    id: response.id || ''
                };

                // Retrieve existing bookmarks from localStorage
                const bookmarks = JSON.parse(window.localStorage.getItem('bookmarks') || '[]');

                // Check if the video is already bookmarked
                const isAlreadyBookmarked = bookmarks.some(bookmarkedVideo => bookmarkedVideo.id === video.id);

                if (!isAlreadyBookmarked) {
                    // Add the new video to bookmarks
                    bookmarks.push(video);
                    // Store updated bookmarks in localStorage
                    window.localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
                    console.log('Video stored in localStorage as a bookmark');
                } else {
                    console.log('Video is already bookmarked');
                }

                return video;
            })
        );
    }
*/

  getVideo(id: string): Observable<any> {
      console.log("********************************************************************");
      console.log(id);
      console.log("********************************************************************");
      const protocol = window.location.protocol;
      const host = window.location.hostname;
      const apiUrl = `${protocol}//${host}/video/${id}`;
      console.log("********************************************************************");
      console.log(apiUrl);
      console.log("********************************************************************");

      return this.http.get<any>(apiUrl).pipe(
          map((response: any) => {
              console.log(`getVideo: Video Response: ${response}`);
              console.dir(response);

              // Construct the video object similar to how it's done in searchVideos
              const video = {
                  userName: response.userName || '',
                  likes: response.likes || '0',
                  comments: response.comments || '0',
                  url: response.url || '',
                  userPic: response.userPic || '',
                  showcase_url: response.showcase_url || '',
                  id: response.id || ''
              };

              // Retrieve existing bookmarks from localStorage
              const bookmarks = JSON.parse(window.localStorage.getItem('bookmarks') || '[]');

              // Check if the video is already bookmarked
              const isAlreadyBookmarked = bookmarks.some(bookmarkedVideo => bookmarkedVideo.id === video.id);

              if (!isAlreadyBookmarked) {
                  // Add the new video to bookmarks
                  bookmarks.push(video);
                  // Store updated bookmarks in localStorage
                  window.localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
                  console.log('Video stored in localStorage as a bookmark');
              } else {
                  console.log('Video is already bookmarked');
              }

              // Return the video wrapped in an array to match the structure of searchVideos
              return [video];
          })
      );
  }



    // Method to get trending videos
    getTrends() {
        const trends = [{
            trendName: 'oneday',
            viewCounts: '117.0M',
            trendProfiles: [
                { id: 0, photo: 'https://p16-sign-sg.tiktokcdn.com/obj/tos-alisg-p-0037/07d1f69ce9d44c1d8595ac98ea3ba1e7?x-expires=1632960000&x-signature=X4zn3PMh9%2F0NBBIFcI8s%2FdssB%2FE%3D' },
                { id: 1, photo: 'https://p16-sign-sg.tiktokcdn.com/obj/tos-alisg-p-0037/4870130f4d394ab5abf7493d198ddf10_1631472363?x-expires=1632960000&x-signature=LecuzUdAAy6FKMTqF65T2YhqliU%3D' }
                // Add more profiles
            ]
        }];
        return trends;
    }

    // Method to get slides
    getSlides() {
        const slides = [
            { id: 0, photo: './assets/png/1.jpg' },
            { id: 1, photo: './assets/png/2.jpg' },
            { id: 2, photo: './assets/png/1.jpg' }
        ];
        return slides;
    }
}

