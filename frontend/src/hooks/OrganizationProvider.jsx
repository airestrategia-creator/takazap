import { OrganizationContext, useOrganizationState } from './useOrganization.js';

export default function OrganizationProvider({ orgId, children }) {
  const value = useOrganizationState(orgId);
  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}
