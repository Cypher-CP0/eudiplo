/**
 * Conditionally strips `trusted_authorities` from each credential query in a
 * DCQL query object.
 *
 * Some wallets do not yet correctly handle `trusted_authorities` in the DCQL
 * query of an OID4VP authorization request. `removeTrustedAuthorities` is an
 * escape hatch (controlled by the `VP_REMOVE_TA` env flag) for deployments
 * that need to work around such wallets; it is disabled by default so
 * `trusted_authorities` is sent to wallets as configured.
 *
 * @param dcqlQuery the DCQL query to (optionally) strip trusted_authorities from
 * @param removeTrustedAuthorities when true, strips trusted_authorities from every credential
 * @returns a DCQL query with credentials stripped of trusted_authorities when removeTrustedAuthorities is true, otherwise the original query
 */
export function applyTrustedAuthoritiesPolicy<
    T extends { credentials: Array<Record<string, unknown>> },
>(dcqlQuery: T, removeTrustedAuthorities: boolean): T {
    if (!removeTrustedAuthorities) {
        return dcqlQuery;
    }

    return {
        ...dcqlQuery,
        credentials: dcqlQuery.credentials.map((cred) => {
            const { trusted_authorities, ...rest } = cred;
            return rest;
        }),
    };
}
