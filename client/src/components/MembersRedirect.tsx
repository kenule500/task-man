import { Navigate, useParams } from 'react-router-dom';

/**
 * Keeps the retired `/{slug}/team` address working by resolving it to the Members screen.
 * Extracted from the route table so the redirect contract can be tested without mounting the
 * whole workspace shell. The main navigation links to `/{slug}/members` directly.
 */
export const MembersRedirect = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  return <Navigate to={`/${workspaceSlug ?? ''}/members`} replace />;
};

export default MembersRedirect;
