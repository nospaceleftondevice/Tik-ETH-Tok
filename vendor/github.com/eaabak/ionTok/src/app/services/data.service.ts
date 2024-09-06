import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})
export class DataService {

    constructor(private http: HttpClient) {}

    getVideoList(page: number = 1, limit: number = 10): Observable<any[]> {
        console.log("Protocol: " + window.location.protocol);
        if (window.location.protocol === 'https:') {
            var protocol = window.location.protocol; // 'https:'
            var host = window.location.hostname;
            var url = protocol + '//' + host;
            const apiUrl = `${url}/videos?page=${page}&limit=${limit}`;
    
            return this.http.get<any>(apiUrl).pipe(
                map((response: any) => {
                    // Access the videos array from the response object
                    console.log(`Response: ${response}`);
                    //console.dir(response);
                    const videos = response.videos || [];
    
                    return videos.map(video => ({
                        userName: video.userName || '',
                        likes: video.likes || '0',
                        comments: video.comments || '0',
                        url: video.url || '',
                        userPic: video.userPic || '',
                        showcase_url: video.showcase_url || '',
                    }));
                })
            );
        } else {
            // Use the hardcoded video list if protocol is not https
            const videoList = [
                {
                    userName: 'balexand',
                    likes: '1344:1040',
                    comments: '2040089:1400493',
                    url: 'https://stream.mux.com/DeKMk02eVhDvdqKxbchkZ38VDrQo312701pDqXpgrJzkc/high.mp4',
                    userPic: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                    showcase_url: 'https://ethglobal.b-cdn.net/projects/s5fha/banner/default.jpg',
                },
                {
                    userName: 'userName2',
                    likes: '0:0',
                    comments: '10:10',
                    url: 'https://firebasestorage.googleapis.com/v0/b/testvideo-91d3a.appspot.com/o/1.mp4?alt=media&token=36032747-7815-473d-beef-061098f08c18',
                    userPic: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                    showcase_url: 'https://ethglobal.com/showcase/flexpay-1yt8q',
                },
                // Add more video entries as needed
            ];

            return of(videoList); // Return an Observable of the hardcoded list
        }
    }

    getTrends() {
        const trends = [{
            trendName: 'oneday',
            viewCounts: '117.0M',
            trendProfiles: [{
                id: 0,
                photo: 'https://p16-sign-sg.tiktokcdn.com/obj/tos-alisg-p-0037/07d1f69ce9d44c1d8595ac98ea3ba1e7?x-expires=1632960000&x-signature=X4zn3PMh9%2F0NBBIFcI8s%2FdssB%2FE%3D'
            }, {
                id: 1,
                photo: 'https://p16-sign-sg.tiktokcdn.com/obj/tos-alisg-p-0037/4870130f4d394ab5abf7493d198ddf10_1631472363?x-expires=1632960000&x-signature=LecuzUdAAy6FKMTqF65T2YhqliU%3D'
            }, {
                id: 2,
                photo: 'https://p16-sign-sg.tiktokcdn.com/obj/tos-alisg-p-0037/9eb176d5871e4ab3a68fdf02e2343ccc_1631272060?x-expires=1632960000&x-signature=Eb5si%2F26R%2BK2eAeQpyEcHtbazwY%3D'
            }, {
                id: 3,
                photo: 'https://p16-sign-sg.tiktokcdn.com/obj/tos-alisg-p-0037/4870130f4d394ab5abf7493d198ddf10_1631472363?x-expires=1632960000&x-signature=LecuzUdAAy6FKMTqF65T2YhqliU%3D'
            }, {
                id: 4,
                photo: 'https://p16-sign-sg.tiktokcdn.com/obj/tos-alisg-p-0037/07d1f69ce9d44c1d8595ac98ea3ba1e7?x-expires=1632960000&x-signature=X4zn3PMh9%2F0NBBIFcI8s%2FdssB%2FE%3D'
            }, {
                id: 5,
                photo: 'https://p16-sign-sg.tiktokcdn.com/obj/tos-alisg-p-0037/4870130f4d394ab5abf7493d198ddf10_1631472363?x-expires=1632960000&x-signature=LecuzUdAAy6FKMTqF65T2YhqliU%3D'
            }]
        },
        {
            trendName: 'alan4747',
            viewCounts: '340.0B',
            trendProfiles: [{
                id: 0,
                photo: 'https://p16-sign-sg.tiktokcdn.com/obj/tos-alisg-p-0037/07d1f69ce9d44c1d8595ac98ea3ba1e7?x-expires=1632960000&x-signature=X4zn3PMh9%2F0NBBIFcI8s%2FdssB%2FE%3D'
            }, {
                id: 1,
                photo: 'https://p16-sign-sg.tiktokcdn.com/obj/tos-alisg-p-0037/07d1f69ce9d44c1d8595ac98ea3ba1e7?x-expires=1632960000&x-signature=X4zn3PMh9%2F0NBBIFcI8s%2FdssB%2FE%3D'
            }, {
                id: 2,
                photo: 'https://p16-sign-sg.tiktokcdn.com/obj/tos-alisg-p-0037/07d1f69ce9d44c1d8595ac98ea3ba1e7?x-expires=1632960000&x-signature=X4zn3PMh9%2F0NBBIFcI8s%2FdssB%2FE%3D'
            }, {
                id: 3,
                photo: 'https://p16-sign-sg.tiktokcdn.com/obj/tos-alisg-p-0037/07d1f69ce9d44c1d8595ac98ea3ba1e7?x-expires=1632960000&x-signature=X4zn3PMh9%2F0NBBIFcI8s%2FdssB%2FE%3D'
            }, {
                id: 4,
                photo: 'https://p16-sign-sg.tiktokcdn.com/obj/tos-alisg-p-0037/07d1f69ce9d44c1d8595ac98ea3ba1e7?x-expires=1632960000&x-signature=X4zn3PMh9%2F0NBBIFcI8s%2FdssB%2FE%3D'
            }, {
                id: 5,
                photo: 'https://p16-sign-sg.tiktokcdn.com/obj/tos-alisg-p-0037/07d1f69ce9d44c1d8595ac98ea3ba1e7?x-expires=1632960000&x-signature=X4zn3PMh9%2F0NBBIFcI8s%2FdssB%2FE%3D'
            }]
        }];
        return trends;
    }

    getSlides() {
        const slides = [
            {
                id: 0,
                photo: './assets/png/1.jpg'
            },
            {
                id: 1,
                photo: './assets/png/2.jpg'
            },
            {
                id: 2,
                photo: './assets/png/1.jpg'
            }
        ];
        return slides;
    }
}
