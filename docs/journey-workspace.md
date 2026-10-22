# Journey workspace

The desktop My Journeys page has Active, History and Archive sections. Active supports a Kanban board and a compact list with the same search, sort, routine and date filters. History and Archive use the list layout. Opening a card or route opens the existing journey editor; secondary archive/restore actions are in its action menu.

## Travel date range

The compact calendar control beside New Journey filters by **travel date**, inclusive of both selected dates. Its default starts at today in IST. Presets include all upcoming travel, the next seven days, this calendar month, the next thirty days, and all dates. Custom ranges are applied deliberately; closing the picker discards the draft selection. An end date before the start date is rejected in both the UI and API.

The date range applies across Active, History and Archive. To find older journeys, choose All dates or a past custom range. Switching sections or Board/List preserves the date window. Tab counts and column counts reflect the selected date bounds and other filters across the account, not merely the currently loaded records. Clearing secondary filters preserves the selected date window.

## Quick filters

- Booking opens this week: planned journeys whose booking opening falls within the configured calendar week in IST, including normal and Tatkal bookings.
- Travelling this week: booked journeys travelling within that week.
- Cancellation pending: journeys still marked To Cancel.

The first day of the week follows the administrator's calendar setting. Quick filters combine with the travel-date window, search and routine filter. Dashboard shortcuts reset a previous desktop date window so the requested action is visible.

## Board and list behavior

Cards show the route, travel date, confirmed departure when available, and booking date/time for planned journeys. They omit repeated status/routine/reminder details and dedicated booking, ticket-view or cancellation links. The journey editor retains those details and actions.

An empty Cancelled column collapses into an expandable rail. It remains a drop target; a successful drop expands the populated column. Board dragging uses the existing revision checks and undo operation. List rows and column pages each load up to thirty records at a time, with explicit additional-page controls. Filter changes invalidate previous cursors.

The dedicated mobile workspace remains separate. Both presentations use the same account authorization, stored journeys, ticket files and save logic.
