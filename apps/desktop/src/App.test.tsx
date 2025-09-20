import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the landing message', () => {
    render(<App />);
    expect(screen.getByText('Roll & Write Foundry')).toBeInTheDocument();
  });
});
