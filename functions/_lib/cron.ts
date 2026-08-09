function matchesPart(part: string, value: number, min: number, max: number): boolean {
  return part.split(",").some((token) => {
    token = token.trim();
    if (token === "*") return true;
    const stepMatch = token.match(/^\*\/(\d+)$/);
    if (stepMatch) {
      const step = Number(stepMatch[1]);
      return step > 0 && value % step === 0;
    }
    const rangeMatch = token.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      const step = Number(rangeMatch[3] ?? 1);
      return start >= min && end <= max && step > 0 && value >= start && value <= end && (value - start) % step === 0;
    }
    const exact = Number(token);
    return Number.isInteger(exact) && exact >= min && exact <= max && exact === value;
  });
}

export function cronMatches(expression: string, date: Date): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minute, hour, day, month, weekday] = parts;
  return (
    matchesPart(minute, date.getUTCMinutes(), 0, 59) &&
    matchesPart(hour, date.getUTCHours(), 0, 23) &&
    matchesPart(day, date.getUTCDate(), 1, 31) &&
    matchesPart(month, date.getUTCMonth() + 1, 1, 12) &&
    matchesPart(weekday, date.getUTCDay(), 0, 6)
  );
}

export function sameUtcMinute(a: string | null | undefined, b: Date): boolean {
  if (!a) return false;
  const first = new Date(a);
  return (
    first.getUTCFullYear() === b.getUTCFullYear() &&
    first.getUTCMonth() === b.getUTCMonth() &&
    first.getUTCDate() === b.getUTCDate() &&
    first.getUTCHours() === b.getUTCHours() &&
    first.getUTCMinutes() === b.getUTCMinutes()
  );
}
