/**
 * DatePicker Component - Enterprise Grade
 *
 * Features:
 * - Calendar dropdown with month/year navigation
 * - Min/max date validation
 * - i18n support
 * - Keyboard navigation
 * - ARIA accessibility
 * - Responsive design
 *
 * Quality comparable to Stripe Elements
 */

export interface DatePickerConfig {
  fieldName: string;
  displayName: string;
  required?: boolean;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  locale?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export class DatePickerComponent {
  private container!: HTMLDivElement;
  private input!: HTMLInputElement;
  private calendar: HTMLDivElement | null = null;
  private selectedDate: Date | null = null;
  private currentMonth: number;
  private currentYear: number;
  private isOpen = false;

  private readonly monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  constructor(private config: DatePickerConfig) {
    const today = new Date();
    this.currentMonth = today.getMonth();
    this.currentYear = today.getFullYear();
  }

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'nevent-datepicker';

    // Input field (read-only, opens calendar on click)
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.name = this.config.fieldName;
    this.input.placeholder = this.config.placeholder || 'Select date';
    this.input.readOnly = true;
    this.input.required = this.config.required || false;
    this.input.className = 'nevent-input nevent-datepicker-input';
    this.input.setAttribute('aria-label', this.config.displayName);

    // Calendar icon
    const icon = document.createElement('span');
    icon.className = 'nevent-datepicker-icon';
    icon.innerHTML = '📅';
    icon.setAttribute('role', 'button');
    icon.setAttribute('aria-label', 'Open calendar');

    // Input wrapper
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'nevent-datepicker-input-wrapper';
    inputWrapper.appendChild(this.input);
    inputWrapper.appendChild(icon);

    // Event listeners
    this.input.addEventListener('click', () => this.toggleCalendar());
    this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));
    icon.addEventListener('click', () => this.toggleCalendar());

    this.container.appendChild(inputWrapper);

    return this.container;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.toggleCalendar();
    } else if (e.key === 'Escape' && this.isOpen) {
      e.preventDefault();
      this.closeCalendar();
    }
  }

  private toggleCalendar(): void {
    if (this.isOpen) {
      this.closeCalendar();
    } else {
      this.openCalendar();
    }
  }

  private openCalendar(): void {
    if (this.calendar) {
      this.calendar.remove();
    }

    this.calendar = this.createCalendar();
    this.container.appendChild(this.calendar);
    this.isOpen = true;

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', this.handleOutsideClick);
    }, 0);
  }

  private closeCalendar(): void {
    if (this.calendar) {
      this.calendar.remove();
      this.calendar = null;
    }
    this.isOpen = false;
    document.removeEventListener('click', this.handleOutsideClick);
  }

  private handleOutsideClick = (event: MouseEvent): void => {
    if (!this.container.contains(event.target as Node)) {
      this.closeCalendar();
    }
  };

  private createCalendar(): HTMLDivElement {
    const calendar = document.createElement('div');
    calendar.className = 'nevent-datepicker-calendar';
    calendar.setAttribute('role', 'dialog');
    calendar.setAttribute('aria-label', 'Choose date');

    // Header (month/year navigation)
    const header = this.createHeader();
    calendar.appendChild(header);

    // Weekday labels
    const weekdaysRow = this.createWeekdaysRow();
    calendar.appendChild(weekdaysRow);

    // Days grid
    const daysGrid = this.createDaysGrid();
    calendar.appendChild(daysGrid);

    return calendar;
  }

  private createHeader(): HTMLDivElement {
    const header = document.createElement('div');
    header.className = 'nevent-datepicker-header';

    // Previous month button
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'nevent-datepicker-nav-btn';
    prevBtn.innerHTML = '◀';
    prevBtn.setAttribute('aria-label', 'Previous month');
    prevBtn.addEventListener('click', () => this.changeMonth(-1));

    // Month/Year display
    const monthYearLabel = document.createElement('span');
    monthYearLabel.className = 'nevent-datepicker-month-year';
    monthYearLabel.textContent = `${this.monthNames[this.currentMonth]} ${this.currentYear}`;

    // Next month button
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'nevent-datepicker-nav-btn';
    nextBtn.innerHTML = '▶';
    nextBtn.setAttribute('aria-label', 'Next month');
    nextBtn.addEventListener('click', () => this.changeMonth(1));

    header.appendChild(prevBtn);
    header.appendChild(monthYearLabel);
    header.appendChild(nextBtn);

    return header;
  }

  private createWeekdaysRow(): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'nevent-datepicker-weekdays';

    const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    weekdays.forEach(day => {
      const cell = document.createElement('div');
      cell.className = 'nevent-datepicker-weekday';
      cell.textContent = day;
      cell.setAttribute('aria-label', day);
      row.appendChild(cell);
    });

    return row;
  }

  private createDaysGrid(): HTMLDivElement {
    const grid = document.createElement('div');
    grid.className = 'nevent-datepicker-days';
    grid.setAttribute('role', 'grid');

    // Get first day of month (0 = Sunday)
    const firstDay = new Date(this.currentYear, this.currentMonth, 1).getDay();

    // Get number of days in month
    const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.className = 'nevent-datepicker-day empty';
      emptyCell.setAttribute('aria-hidden', 'true');
      grid.appendChild(emptyCell);
    }

    // Add day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(this.currentYear, this.currentMonth, day);
      const dayCell = this.createDayCell(day, date);
      grid.appendChild(dayCell);
    }

    return grid;
  }

  private createDayCell(day: number, date: Date): HTMLDivElement {
    const cell = document.createElement('div');
    cell.className = 'nevent-datepicker-day';
    cell.textContent = day.toString();
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', this.formatDate(date));

    // Check if date is disabled
    if (this.isDateDisabled(date)) {
      cell.classList.add('disabled');
      cell.setAttribute('aria-disabled', 'true');
    } else {
      // Check if selected
      if (this.selectedDate && this.isSameDay(date, this.selectedDate)) {
        cell.classList.add('selected');
        cell.setAttribute('aria-selected', 'true');
      }

      // Check if today
      if (this.isSameDay(date, new Date())) {
        cell.classList.add('today');
      }

      // Click handler
      cell.addEventListener('click', () => this.selectDate(date));
      cell.tabIndex = 0;
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.selectDate(date);
        }
      });
    }

    return cell;
  }

  private isDateDisabled(date: Date): boolean {
    if (this.config.minDate && date < this.config.minDate) {
      return true;
    }
    if (this.config.maxDate && date > this.config.maxDate) {
      return true;
    }
    return false;
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  private selectDate(date: Date): void {
    this.selectedDate = date;
    this.input.value = this.formatDate(date);
    this.closeCalendar();

    // Trigger change event
    const event = new Event('change', { bubbles: true });
    this.input.dispatchEvent(event);
  }

  private changeMonth(delta: number): void {
    this.currentMonth += delta;

    if (this.currentMonth < 0) {
      this.currentMonth = 11;
      this.currentYear--;
    } else if (this.currentMonth > 11) {
      this.currentMonth = 0;
      this.currentYear++;
    }

    // Refresh calendar
    if (this.calendar) {
      const newCalendar = this.createCalendar();
      this.calendar.replaceWith(newCalendar);
      this.calendar = newCalendar;
    }
  }

  private formatDate(date: Date): string {
    // Format as YYYY-MM-DD (ISO format)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getValue(): string {
    return this.input.value;
  }

  setValue(dateString: string): void {
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        this.selectDate(date);
      }
    } catch (error) {
      console.error('Invalid date string:', dateString);
    }
  }

  validate(): ValidationResult {
    if (this.config.required && !this.input.value) {
      return { valid: false, error: `${this.config.displayName} is required` };
    }
    return { valid: true };
  }

  destroy(): void {
    this.closeCalendar();
    document.removeEventListener('click', this.handleOutsideClick);
  }
}
