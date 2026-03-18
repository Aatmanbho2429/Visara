import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface UserState {
  id:                      string;
  first_name:              string;
  last_name:               string;
  email:                   string;
  subscription_status:     string;   // 'trial' | 'active' | 'expired' | 'exhausted'
  subscription_end:        string | null;
  free_searches_remaining: number;
  days_remaining:          number | null;
}

const DEFAULT_STATE: UserState = {
  id:                      '',
  first_name:              '',
  last_name:               '',
  email:                   '',
  subscription_status:     'trial',
  subscription_end:        null,
  free_searches_remaining: 10,
  days_remaining:          null,
};

@Injectable({ providedIn: 'root' })
export class UserStateService {

  // ── Single source of truth ────────────────────────────────────────────
  private _user$ = new BehaviorSubject<UserState>(DEFAULT_STATE);
  user$ = this._user$.asObservable();

  constructor(private zone: NgZone) {
    this.loadFromStorage();
  }

  // ── Get current value synchronously ──────────────────────────────────
  get user(): UserState {
    return this._user$.getValue();
  }

  get userId(): string {
    return this._user$.getValue().id;
  }

  get isLoggedIn(): boolean {
    return !!this._user$.getValue().id;
  }

  get canSearch(): boolean {
    const u = this._user$.getValue();
    return (u.subscription_status === 'trial'  && u.free_searches_remaining > 0)
        || (u.subscription_status === 'active');
  }

  // ── Set user after login / validate-token ─────────────────────────────
  setUser(userData: Partial<UserState>) {
    this.zone.run(() => {
      const current = this._user$.getValue();
      const next    = { ...current, ...userData };
      this._user$.next(next);
      this.saveToStorage(next);
    });
  }

  // ── Update only subscription fields after decrement ───────────────────
  updateSubscription(data: {
    subscription_status:     string;
    free_searches_remaining: number | null;
    days_remaining:          number | null;
  }) {
    this.zone.run(() => {
      const current = this._user$.getValue();
      const next = {
        ...current,
        subscription_status:     data.subscription_status,
        free_searches_remaining: data.free_searches_remaining ?? current.free_searches_remaining,
        days_remaining:          data.days_remaining          ?? current.days_remaining,
      };
      this._user$.next(next);
      this.saveToStorage(next);
    });
  }

  // ── Clear on logout ───────────────────────────────────────────────────
  clear() {
    this.zone.run(() => {
      this._user$.next({ ...DEFAULT_STATE });
      sessionStorage.removeItem('visara_user');
    });
  }

  // ── Persist to sessionStorage ─────────────────────────────────────────
  private saveToStorage(user: UserState) {
    try {
      sessionStorage.setItem('visara_user', JSON.stringify(user));
    } catch {}
  }

  private loadFromStorage() {
    try {
      const str = sessionStorage.getItem('visara_user');
      if (str) {
        const user = JSON.parse(str);
        this._user$.next({ ...DEFAULT_STATE, ...user });
      }
    } catch {}
  }
}