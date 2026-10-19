import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import MembersRedirect from '../MembersRedirect';

const LocationProbe = () => {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
};

describe('MembersRedirect', () => {
  it('AC-035: the retired /team address resolves to the Members screen', () => {
    render(
      <MemoryRouter initialEntries={['/acme/team']}>
        <Routes>
          <Route
            path="/:workspaceSlug/team"
            element={(
              <>
                <MembersRedirect />
                <LocationProbe />
              </>
            )}
          />
          <Route
            path="/:workspaceSlug/members"
            element={(
              <>
                <div>Members page</div>
                <LocationProbe />
              </>
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Members page')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/acme/members');
  });
});
