export function formatAbsoluteDate(d: Date) {
    const today = new Date();
    const month = (d.getMonth()+1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    if (today.getFullYear() !== d.getFullYear())
        return `${d.getFullYear()}/${month}/${day}`;
    if (today.toDateString() !== d.toDateString())
        return `${month}/${day}`;

    const hour = d.getHours().toString().padStart(2, '0');
    const minute = d.getMinutes().toString().padStart(2, '0');
    const second = d.getSeconds().toString().padStart(2, '0');
    return `${hour}:${minute}:${second}`;
}
