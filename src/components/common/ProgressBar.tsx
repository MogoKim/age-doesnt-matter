'use client'

import { AppProgressBar } from 'next-nprogress-bar'

export default function ProgressBar() {
  return (
    <AppProgressBar
      height="3px"
      color="#FF6F61"
      options={{ showSpinner: false }}
      shallowRouting
    />
  )
}
