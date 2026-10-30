# Remove a patient from their card (#1362)

**Decided by the maintainer, 30 Oct (#1356, option A, as Jane and Cliniko do).**

- The card ends with **Remove <name>**, admin only. The server decides what it does.
- Nothing on record (no given or past treatment, no discharge summary): deleted for good, after a confirm that says so.
- Anything on record: archived. The record stays; they leave the Patients list, the day, the sheets and booking. Patient search still finds them, marked "Removed · record kept", and their card offers **Restore**.

**Decided by Claude, to confirm:**

- Archiving cancels their treatments from today on and ends a current stay yesterday (a stay that has not started is dropped), so the day, the sheets and the guest rooms stop counting them. The confirm names how many treatments go.
- Restore brings back the patient, not the cancelled treatments or the stay: a returning guest gets a new stay.
- The Undo toast after adding someone, when it cannot undo, now says to open the card and tap Remove.
