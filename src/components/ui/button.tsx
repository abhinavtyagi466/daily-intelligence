import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const buttonVariants = cva("button", {
  variants: { variant: { primary: "button-primary", outline: "button-outline", ghost: "button-ghost" } },
  defaultVariants: { variant: "primary" },
});

export function Button({ className, variant, type = "button", ...props }:
  ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button type={type} className={twMerge(clsx(buttonVariants({ variant }), className))} {...props} />;
}
