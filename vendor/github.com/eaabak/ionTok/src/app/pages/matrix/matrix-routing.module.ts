import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MatrixPage } from './matrix.page';

const routes: Routes = [
  {
    path: '',
    component: MatrixPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MatrixPageRoutingModule {}
