import { Pipe, PipeTransform } from '@angular/core';
import { formatDayDivider } from '../utils/time';

@Pipe({ name: 'dateDivider' })
export class DateDividerPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    return formatDayDivider(value);
  }
}
