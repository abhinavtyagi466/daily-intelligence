const kolkataDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
});

export function workspaceDay(value: Date | string = new Date()) {
  return kolkataDay.format(new Date(value));
}
