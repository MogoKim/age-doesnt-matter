'use client'

import { type InputHTMLAttributes, forwardRef } from 'react'
import styles from './Input.module.css'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  success?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, success, className, id, ...props }, ref) => {
    const inputId = id ?? label?.replace(/\s/g, '-').toLowerCase()

    return (
      <div className={`${styles.wrapper} ${error ? styles.error : ''} ${className ?? ''}`}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
          </label>
        )}
        <input ref={ref} id={inputId} className={styles.input} {...props} />
        {error && <p className={`${styles.message} ${styles.errorMessage}`}>{error}</p>}
        {success && !error && (
          <p className={`${styles.message} ${styles.successMessage}`}>{success}</p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'
export default Input
