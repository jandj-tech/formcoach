import { redirect } from 'next/navigation'

// Login is unified at /login — coaches log in there with the same form.
export default function TeamLoginPage() {
  redirect('/login')
}
