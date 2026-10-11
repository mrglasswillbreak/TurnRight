/** Source acceptance already updates the working baseline; publication is separate. */
export function BaselineReview() {
  return (
    <div className="change-card">
      <strong>Publish your accepted updates</strong>
      <p className="small-note">
        Accepted source updates are already in the working baseline. Your saved corrections still
        take precedence. Resolve validation issues, submit the workspace in Review for approval,
        then build and inspect a preview in Publish.
      </p>
      <p className="small-note">
        A different baseline version is expected after source updates or a release. You do not need
        to replace the baseline with the older public map. Restoring a previous release is a
        separate reviewed action in Publish.
      </p>
    </div>
  );
}
