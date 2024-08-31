iimport { IonSlides } from '@ionic/angular';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class Home implements OnInit {

  @ViewChild(IonSlides, { static: false }) slides: IonSlides;

  constructor() { }

  ngOnInit() {}

  async onSlideChange() {
    const index = await this.slides.getActiveIndex();
    console.log('Current slide index:', index);
    // You can call any JavaScript function here
    this.handleSlideChange(index);
  }

  handleSlideChange(index: number) {
    // Add your logic here, e.g., start/stop video playback, load new data, etc.
    console.log('Handling slide change for slide index:', index);
  }
}

