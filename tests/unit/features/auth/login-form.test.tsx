import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LoginForm } from '@/features/auth/components/login-form'

describe('LoginForm', () => {
  it('renders email input and submit button', () => {
    render(<LoginForm />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument()
  })

  it('shows validation hint text', () => {
    render(<LoginForm />)
    expect(screen.getByText(/Ссылка для входа будет отправлена/)).toBeInTheDocument()
  })

  it('has email input with required attribute', () => {
    render(<LoginForm />)
    const input = screen.getByLabelText('Email')
    expect(input).toBeRequired()
  })

  it('has autocomplete attribute', () => {
    render(<LoginForm />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('autocomplete', 'email')
  })

  it('submit button is not disabled initially', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: 'Войти' })).not.toBeDisabled()
  })

  it('has correct input type', () => {
    render(<LoginForm />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('type', 'email')
  })
})
