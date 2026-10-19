// An explicit locale/time zone keeps server and browser hydration identical.
const modifiedDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric',
});

export function formatModifiedDate(modified: string): string {
    return modifiedDateFormatter.format(new Date(modified));
}
