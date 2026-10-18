import { z } from 'zod';

/**
 * A refused value reaches a receptionist, so every rule says what is wrong in a
 * sentence, never "Too big: expected string to have <=120 characters". A rule
 * that writes its own message still wins; this covers the rest.
 */
const nameOf = (path: PropertyKey[]) => {
  const words = String(path[path.length - 1] ?? 'This').replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

z.config({
  customError: (iss) => {
    const who = nameOf(iss.path ?? []);
    if (iss.code === 'too_big' && iss.origin === 'string') return `${who} is too long: ${iss.maximum} characters at most.`;
    if (iss.code === 'too_big') return `${who} can be at most ${iss.maximum}.`;
    if (iss.code === 'too_small' && iss.origin === 'string') return iss.minimum === 1 ? `${who} cannot be empty.` : `${who} must be at least ${iss.minimum} characters.`;
    if (iss.code === 'too_small') return `${who} must be at least ${iss.minimum}.`;
    if (iss.code === 'invalid_format' && iss.format === 'email') return 'Enter a valid email address, such as care@yourcentre.in.';
    if (iss.code === 'invalid_type') return `${who} is missing or not in the right form.`;
    return undefined;
  },
});

/** The first refusal as one sentence, and the field it belongs to so a screen can put it beside the box. */
export const firstRefusal = (e: z.ZodError) => {
  const i = e.issues[0];
  return { error: i?.message || 'That was not accepted.', field: i?.path.join('.') || undefined };
};
