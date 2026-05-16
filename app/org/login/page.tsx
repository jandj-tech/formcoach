import { redirect } from 'next/navigation'

// Login is unified at /login — organizations log in there with the same form.
export default function OrgLoginPage() {
  redirect('/login')
}
