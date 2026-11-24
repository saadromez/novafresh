/**
 * Date and Time utilities for Sri Lanka (Asia/Colombo / UTC+05:30)
 * Guarantees exact parity between database timestamps, printed receipts,
 * re-prints, sales history, and backoffice analytics.
 */

const TIMEZONE = 'Asia/Colombo';

/**
 * Returns the current date and time as 'YYYY-MM-DD HH:mm:ss' in Sri Lanka timezone
 */
export function getSriLankaNowString(dateInput: Date | string | number = new Date()): string {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/**
 * Converts any date representation (ISO UTC, local string, or Date) into a formatted Sri Lanka time string.
 * Format: 'DD/MM/YYYY, hh:mm:ss A' or 'DD/MM/YYYY, hh:mm A'
 */
export function formatSriLankaDateTime(
  dateInput: any, 
  options: { showSeconds?: boolean; dateOnly?: boolean; timeOnly?: boolean } = {}
): string {
  if (!dateInput) return '-';

  try {
    let d: Date;
    if (dateInput instanceof Date) {
      d = dateInput;
    } else if (typeof dateInput === 'string') {
      const trimmed = dateInput.trim();
      // If it's a standard SQLite string without timezone: "YYYY-MM-DD HH:mm:ss"
      if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/.test(trimmed)) {
        // Treat as local representation or parse explicitly
        const [datePart, timePart = '00:00:00'] = trimmed.replace('T', ' ').split(' ');
        const [year, month, day] = datePart.split('-').map(Number);
        const timeParts = timePart.split(':');
        const hour = Number(timeParts[0] || 0);
        const min = Number(timeParts[1] || 0);
        const sec = Math.floor(Number(timeParts[2] || 0));
        
        if (options.dateOnly) {
          return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
        }
        
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        const timeStr = options.showSeconds !== false
          ? `${String(displayHour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')} ${ampm}`
          : `${String(displayHour).padStart(2, '0')}:${String(min).padStart(2, '0')} ${ampm}`;

        if (options.timeOnly) return timeStr;
        return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}, ${timeStr}`;
      }

      if (/^\d{2}\/\d{2}\/\d{4}/.test(trimmed)) {
        if (options.timeOnly) {
          const parts = trimmed.split(/,\s*/);
          return parts[1] || trimmed;
        }
        return trimmed;
      }

      d = new Date(trimmed);
    } else {
      d = new Date(dateInput);
    }

    if (isNaN(d.getTime())) return String(dateInput);

    if (options.dateOnly) {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: TIMEZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(d);
    }

    if (options.timeOnly) {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: options.showSeconds !== false ? '2-digit' : undefined,
        hour12: true
      }).format(d);
    }

    const dateFormatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(d);

    const timeFormatted = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: options.showSeconds !== false ? '2-digit' : undefined,
      hour12: true
    }).format(d);

    return `${dateFormatted}, ${timeFormatted}`;
  } catch (_) {
    return String(dateInput);
  }
}

/**
 * Formats date for thermal receipt printing: 'DD/MM/YYYY, hh:mm:ss A'
 * Guarantees 12-hour format with AM/PM across all thermal printers and POS slips
 */
export function formatReceiptDate(dateInput: any, options: { showSeconds?: boolean } = {}): string {
  return formatSriLankaDateTime(dateInput, { showSeconds: options.showSeconds !== undefined ? options.showSeconds : true });
}

/**
 * Formats a Date object as 'YYYY-MM-DD' in Sri Lanka timezone
 */
export function toSriLankaYMD(dateInput: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(dateInput);
}
