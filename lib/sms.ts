import twilio from 'twilio'

function getClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
}

const FROM = process.env.TWILIO_PHONE_NUMBER!

export async function sendClassPurchaseConfirmationSms(
  to: string,
  orgName: string,
  playerCount: number,
  teamAccessCode: string,
) {
  const body = [
    `LearnHoops: Your 10-Week Shooting Development Program is confirmed!`,
    `Org: ${orgName}`,
    `Players: ${playerCount}`,
    `Team code: ${teamAccessCode}`,
    `Players join with this code. Balls ship to the address you provided.`,
    `Dashboard: https://learnhoops.com/org/dashboard`,
  ].join('\n')

  await getClient().messages.create({ from: FROM, to, body })
}
