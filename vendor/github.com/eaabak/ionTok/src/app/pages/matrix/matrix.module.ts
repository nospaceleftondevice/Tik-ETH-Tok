import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MatrixPageRoutingModule } from './matrix-routing.module';

import { MatrixPage } from './matrix.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MatrixPageRoutingModule
  ],
  declarations: [MatrixPage]
})
export class MatrixPageModule {}
