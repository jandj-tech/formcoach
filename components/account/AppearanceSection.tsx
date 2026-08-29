import Section from '@/components/account/Section'
import AppearanceToggle from '@/components/account/AppearanceToggle'

/**
 * The Appearance card, ready to drop into any account's Settings tab.
 *
 * Every account type shows the identical control, so it lives here once rather
 * than as four copies that drift apart the first time the wording changes.
 */
export default function AppearanceSection() {
  return (
    <Section
      title="Appearance"
      tipLabel="What does appearance change?"
      tip="Switches your account pages between light and dark. Dark is easier on the eyes in a dark room. The choice is remembered on this device."
    >
      <AppearanceToggle />
    </Section>
  )
}
