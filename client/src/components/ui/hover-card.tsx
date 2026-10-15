"use client"

import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card"
import { cn } from "cn"
import {
  floatingPanelVariants,
  type FloatingPanelVariants,
} from "@/components/ds/variants"

/** Opening delay shared by every hover card (ms). Keyboard focus opens it after the same delay. */
const HOVER_CARD_DELAY = 400

function HoverCard({ ...props }: PreviewCardPrimitive.Root.Props) {
  return <PreviewCardPrimitive.Root data-slot="hover-card" {...props} />
}

/**
 * The element that opens the card on hover or focus. It renders a link by default; pass
 * `render={<button type="button" />}` (or a span with tabIndex) for non-navigating triggers.
 */
function HoverCardTrigger({
  delay = HOVER_CARD_DELAY,
  ...props
}: PreviewCardPrimitive.Trigger.Props) {
  return (
    <PreviewCardPrimitive.Trigger
      data-slot="hover-card-trigger"
      delay={delay}
      {...props}
    />
  )
}

function HoverCardContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  width,
  padding,
  children,
  ...props
}: PreviewCardPrimitive.Popup.Props &
  FloatingPanelVariants &
  Pick<
    PreviewCardPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <PreviewCardPrimitive.Portal>
      <PreviewCardPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
      >
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(floatingPanelVariants({ width, padding }), className)}
          {...props}
        >
          {children}
        </PreviewCardPrimitive.Popup>
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  )
}

export { HOVER_CARD_DELAY, HoverCard, HoverCardContent, HoverCardTrigger }
