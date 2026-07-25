# Federated Capability Offer Discovery Cell

This settlement performs one operation: observe an exact finite denominator of
public ActivityPub outboxes and return matching canonical RMN capability offers.

It does not crawl ambiently, rank or choose providers, grant authority, invoke a
provider, clear payment, attest provider output, or claim market completeness.
Those are other Capability Cells.

Only public ActivityStreams `Offer` projections are visible. Private or
recipient-addressed activities are outside this operation.

Experimental account and receipts use `eip155:5615610`; `eip155:561561` is
reserved.

