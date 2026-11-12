import { Pipe, PipeTransform } from '@angular/core';
import { formatFullDate, formatRelativeTime } from '../utils/time';

@Pipe({ name: 'relativeTime' })
export class RelativeTimePipe implements PipeTransform {
  transform(value: string | null | undefined, now = Date.now()): string {
    if (!value) return '';
    return formatRelativeTime(value, now);
  }
}

@Pipe({ name: 'fullDate' })
export class FullDatePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    return formatFullDate(value);
  }
}
