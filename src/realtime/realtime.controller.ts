import { Controller, Sse, MessageEvent } from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Controller('realtime')
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Sse('stream')
  streamEvents(): Observable<MessageEvent> {
    return this.realtimeService.getEventStream().pipe(
      map((event) => ({
        data: event,
      } as MessageEvent)),
    );
  }
}
