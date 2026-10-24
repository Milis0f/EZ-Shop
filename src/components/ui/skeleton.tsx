import { cn } from "@/lib/utils"

/** Loading placeholder: a slow sweep while content loads, static under reduced motion. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("skeleton-shimmer rounded-tile", className)}
      {...props}
    />
  )
}

export { Skeleton }
