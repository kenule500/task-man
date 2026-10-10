import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"
import {
  switchThumbVariants,
  switchVariants,
  type SwitchVariants,
} from "@/components/ds/variants"

type SwitchProps = SwitchPrimitive.Root.Props & SwitchVariants

/**
 * On/off control that applies at once. It has no visible text of its own: name it with
 * `aria-label`, `aria-labelledby` or wrap it in a `SwitchField` (components/ds).
 */
function Switch({ className, size, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(switchVariants({ size }), className)}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={switchThumbVariants({ size })}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
