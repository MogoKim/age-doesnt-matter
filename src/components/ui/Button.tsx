'use client'

import { type ButtonHTMLAttributes, forwardRef } from 'react'
import styles from './Button.module.css'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  isLoading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', isLoading = false, children, className, disabled, ...props }, ref) => {
    const classNames = [
      styles.button,
      styles[variant],
      isLoading ? styles.loading : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <button
        ref={ref}
        className={classNames}
        disabled={disabled || isLoading}
        aria-disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <span className={styles.spinner} aria-hidden="true" />}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
export default Button
