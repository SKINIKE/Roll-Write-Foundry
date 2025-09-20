import { fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';

describe('App shell', () => {
  it('renders the main navigation', () => {
    render(<App />);
    expect(screen.getByTestId('nav-editor')).toBeInTheDocument();
    expect(screen.getByTestId('nav-play')).toBeInTheDocument();
  });

  it('reflects form edits in the board preview', () => {
    render(<App />);
    const oreButton = screen.getByRole('button', { name: /Ore \(ore\)/i });
    fireEvent.click(oreButton);
    const labelField = screen.getByLabelText('Label');
    fireEvent.change(labelField, { target: { value: 'Refined Ore' } });
    const resourceCard = screen.getByTestId('resource-card-ore');
    expect(within(resourceCard).getByText('Refined Ore')).toBeInTheDocument();
  });
});
