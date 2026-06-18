// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/preact'

function Hello({ name }: { name: string }) {
  return <div>Hello {name}</div>
}

describe('preact jsx renders under vitest+jsdom', () => {
  it('renders a component', () => {
    render(<Hello name="Ada" />)
    expect(screen.getByText('Hello Ada')).toBeTruthy()
  })
})
