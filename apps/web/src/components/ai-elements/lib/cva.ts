// Local stand-in for `class-variance-authority`'s `cva` and `VariantProps`, which the shadcn ui
// primitives behind AI Elements use to pick a class string per variant.
//
// Only the part those primitives use: a base class, one class string per variant value, and
// defaults. Compound variants are not implemented because no vendored primitive declares any.
import { cn, type ClassValue } from './utils';

type VariantSchema = Record<string, Record<string, ClassValue>>;

type StringToBoolean<T> = T extends 'true' | 'false' ? boolean : T;

type VariantSelection<V extends VariantSchema> = {
  [K in keyof V]?: StringToBoolean<keyof V[K]> | null;
};

export interface CvaConfig<V extends VariantSchema> {
  variants?: V;
  defaultVariants?: VariantSelection<V>;
}

export type CvaProps<V extends VariantSchema> = VariantSelection<V> & {
  class?: ClassValue;
  className?: ClassValue;
};

export function cva<V extends VariantSchema>(base: ClassValue, config: CvaConfig<V> = {}) {
  return (props?: CvaProps<V>): string => {
    const variants = config.variants ?? ({} as V);
    const picked: ClassValue[] = [];
    for (const name of Object.keys(variants) as Array<keyof V>) {
      const requested = props?.[name];
      const value = requested ?? config.defaultVariants?.[name];
      if (value === null || value === undefined) continue;
      picked.push(variants[name]?.[String(value)]);
    }
    return cn(base, picked, props?.class, props?.className);
  };
}

type OmitUndefined<T> = T extends undefined ? never : T;

/** The variant props a `cva` function accepts, without its class passthrough. */
export type VariantProps<Component extends (...args: never[]) => unknown> = Omit<
  OmitUndefined<Parameters<Component>[0]>,
  'class' | 'className'
>;
