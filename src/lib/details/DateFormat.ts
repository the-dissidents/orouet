import { getLocale } from "$lib/I18n";

type DateFormatOptions = {
    // Dates within this many calendar days retain their time.
    recentDays?: number;
    now?: Date;
};

type DateParts = {
    year: number;
    month: number;
    day: number;
};

type Candidate = {
    format: Intl.DateTimeFormat;
    label: string;
};

function getDateParts(
    date: Date,
    formatter: Intl.DateTimeFormat
): DateParts {
    const parts = formatter.formatToParts(date);

    const get = (type: string) =>
        Number(parts.find(p => p.type === type)!.value);

    return {
        year: get("year"),
        month: get("month"),
        day: get("day"),
    };
}

// Convert calendar dates to a UTC-based day number.
// This avoids DST and variable-length-day problems.
function calendarDayNumber(p: DateParts): number {
    return Math.floor(
        Date.UTC(p.year, p.month - 1, p.day) / 86400000
    );
}

const monthDay: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
};

const monthYear: Intl.DateTimeFormatOptions = {
    month: "long",
    year: "numeric",
};

const fullDate: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
};

const dateTime: Intl.DateTimeFormatOptions = {
    ...monthDay,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
};

const dateTimeSeconds: Intl.DateTimeFormatOptions = {
    ...dateTime,
    second: "2-digit",
};

export function formatDateTimeList(
    dates: Date[],
    options: DateFormatOptions = {}
): string[] {
    console.log(dates);

    const {
        recentDays = 7,
        now = new Date()
    } = options;

    const calendarFormatter = new Intl.DateTimeFormat(
        getLocale(),
        {
            year: "numeric",
            month: "numeric",
            day: "numeric",
        }
    );

    const nowParts = getDateParts(now, calendarFormatter);
    const nowDay = calendarDayNumber(nowParts);
    const dateParts = dates.map(date => getDateParts(date, calendarFormatter));

    const candidates = dates.map((date, i): Candidate[] => {
        const p = dateParts[i];

        const ageInDays = Math.abs(nowDay - calendarDayNumber(p));
        const yearDifference = nowParts.year - p.year;
        const isRecent = ageInDays <= recentDays;

        const formats: Intl.DateTimeFormatOptions[] = [];

        if (isRecent) {
            // Recent dates retain both day and time.
            formats.push(
                dateTime,
                dateTimeSeconds,
            );
        } else if (yearDifference == 0) {
            formats.push(
                monthDay,
                dateTime,
                dateTimeSeconds,
                fullDate
            );
        } else if (yearDifference < 2) {
            // Previous years: initially retain month and year.
            formats.push(
                monthYear,
                fullDate,
                dateTime,
                dateTimeSeconds
            );
        } else {
            // Old history: initially retain only the year.
            formats.push(
                { year: "numeric" },
                monthYear,
                fullDate,
                dateTime,
                dateTimeSeconds
            );
        }

        return formats.map(format => {
            const formatter = new Intl.DateTimeFormat(getLocale(), format);
            return {
                format: formatter,
                label: formatter.format(date),
            };
        });
    });

    // Start with the least detailed representation.
    const precision = dates.map(() => 0);
    const labels = () => candidates.map((list, i) => list[precision[i]].label);

    // Resolve collisions between neighboring entries.
    // Increase precision on both sides to avoid arbitrary
    // preference for either the earlier or later entry.
    let changed = true;

    while (changed) {
        changed = false;

        const current = labels();

        for (let i = 0; i < current.length - 1; i++) {
            if (current[i] !== current[i + 1]) continue;
            const left = candidates[i];
            const right = candidates[i + 1];

            if (precision[i] < left.length - 1) {
                precision[i]++;
                changed = true;
            }

            if (precision[i + 1] < right.length - 1) {
                precision[i + 1]++;
                changed = true;
            }
        }
    }

    return labels();
    }

export function formatTime(d: Date) {
    const hour = d.getHours().toString().padStart(2, '0');
    const minute = d.getMinutes().toString().padStart(2, '0');
    const second = d.getSeconds().toString().padStart(2, '0');
    return `${hour}:${minute}:${second}`;
}

export function formatFullDate(d: Date) {
    return new Intl.DateTimeFormat(getLocale(), {
        ...dateTimeSeconds,
        year: "numeric",
    }).format(d);
}
