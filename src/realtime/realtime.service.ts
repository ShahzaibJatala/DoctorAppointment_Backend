import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

@Injectable()
export class RealtimeService {
  private readonly eventSubject = new Subject<any>();

  emit(type: string, data: any) {
    this.eventSubject.next({ type, data });
  }

  getEventStream() {
    return this.eventSubject.asObservable();
  }
}
