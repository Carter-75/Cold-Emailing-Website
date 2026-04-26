import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root'
})
export class BillingService {
  private api = inject(ApiService);

  createCheckoutSession() {
    return this.api.postData<{ url: string }>('billing/create-checkout-session', {});
  }
}
