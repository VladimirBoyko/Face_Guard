import assert from "node:assert/strict";
import test from "node:test";

import {
  enrolmentMarkerPlacement,
  markerIsOnDifferentDisplay,
} from "../src/desktop/enrolment-marker-position.ts";

const singleDisplay = { x: 0, y: 0, width: 1440, height: 900 };
const leftDisplay = { x: -1920, y: 0, width: 1920, height: 1080 };
const rightDisplay = { x: 0, y: 0, width: 2560, height: 1440 };

test("one-screen enrolment keeps the existing in-window marker", () => {
  assert.equal(
    enrolmentMarkerPlacement([singleDisplay], "upper-left"),
    null,
  );
});

test("the centre photo remains inside FaceGuard on multiple screens", () => {
  assert.equal(
    enrolmentMarkerPlacement([leftDisplay, rightDisplay], "centre"),
    null,
  );
});

test("left and right enrolment markers use the outer desktop displays", () => {
  const upperLeft = enrolmentMarkerPlacement(
    [rightDisplay, leftDisplay],
    "upper-left",
  );
  const lowerRight = enrolmentMarkerPlacement(
    [rightDisplay, leftDisplay],
    "lower-right",
  );

  assert.ok(upperLeft);
  assert.ok(lowerRight);
  assert.equal(upperLeft.position, "upper-left");
  assert.ok(upperLeft.bounds.x < 0);
  assert.ok(upperLeft.bounds.y >= leftDisplay.y);
  assert.equal(lowerRight.position, "lower-right");
  assert.ok(lowerRight.bounds.x >= 0);
  assert.ok(
    lowerRight.bounds.y + lowerRight.bounds.height <
      rightDisplay.y + rightDisplay.height,
  );
});

test("the other-screen cue appears only when marker and app use different displays", () => {
  const upperLeft = enrolmentMarkerPlacement(
    [rightDisplay, leftDisplay],
    "upper-left",
  );
  const upperRight = enrolmentMarkerPlacement(
    [rightDisplay, leftDisplay],
    "upper-right",
  );

  assert.ok(upperLeft);
  assert.ok(upperRight);
  assert.equal(
    markerIsOnDifferentDisplay(
      [rightDisplay, leftDisplay],
      upperLeft.bounds,
      rightDisplay,
    ),
    true,
  );
  assert.equal(
    markerIsOnDifferentDisplay(
      [rightDisplay, leftDisplay],
      upperRight.bounds,
      rightDisplay,
    ),
    false,
  );
  assert.equal(
    markerIsOnDifferentDisplay(
      [singleDisplay],
      singleDisplay,
      singleDisplay,
    ),
    false,
  );
});
