export function getSafeErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const isTechnicalError =
      'code' in err ||
      'errno' in err ||
      'sqlState' in err ||
      'sql' in err ||
      err.message.includes('SQL') ||
      err.message.includes('ER_') ||
      err.message.includes('CONSTRAINT') ||
      err.message.includes('foreign key') ||
      err.message.includes('at ');

    if (!isTechnicalError && err.message.trim().length > 0) {
      return err.message;
    }
  }
  return fallback;
}
