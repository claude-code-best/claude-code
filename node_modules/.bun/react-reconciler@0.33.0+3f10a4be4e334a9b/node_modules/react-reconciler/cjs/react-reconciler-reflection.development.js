/**
 * @license React
 * react-reconciler-reflection.development.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";
"production" !== process.env.NODE_ENV &&
  (function () {
    function getNearestMountedFiber(fiber) {
      var node = fiber,
        nearestMounted = fiber;
      if (fiber.alternate) for (; node.return; ) node = node.return;
      else {
        fiber = node;
        do
          (node = fiber),
            0 !== (node.flags & 4098) && (nearestMounted = node.return),
            (fiber = node.return);
        while (fiber);
      }
      return 3 === node.tag ? nearestMounted : null;
    }
    function assertIsMounted(fiber) {
      if (getNearestMountedFiber(fiber) !== fiber)
        throw Error("Unable to find node on an unmounted component.");
    }
    function findCurrentFiberUsingSlowPath(fiber) {
      var alternate = fiber.alternate;
      if (!alternate) {
        alternate = getNearestMountedFiber(fiber);
        if (null === alternate)
          throw Error("Unable to find node on an unmounted component.");
        return alternate !== fiber ? null : fiber;
      }
      for (var a = fiber, b = alternate; ; ) {
        var parentA = a.return;
        if (null === parentA) break;
        var parentB = parentA.alternate;
        if (null === parentB) {
          b = parentA.return;
          if (null !== b) {
            a = b;
            continue;
          }
          break;
        }
        if (parentA.child === parentB.child) {
          for (parentB = parentA.child; parentB; ) {
            if (parentB === a) return assertIsMounted(parentA), fiber;
            if (parentB === b) return assertIsMounted(parentA), alternate;
            parentB = parentB.sibling;
          }
          throw Error("Unable to find node on an unmounted component.");
        }
        if (a.return !== b.return) (a = parentA), (b = parentB);
        else {
          for (var didFindChild = !1, _child = parentA.child; _child; ) {
            if (_child === a) {
              didFindChild = !0;
              a = parentA;
              b = parentB;
              break;
            }
            if (_child === b) {
              didFindChild = !0;
              b = parentA;
              a = parentB;
              break;
            }
            _child = _child.sibling;
          }
          if (!didFindChild) {
            for (_child = parentB.child; _child; ) {
              if (_child === a) {
                didFindChild = !0;
                a = parentB;
                b = parentA;
                break;
              }
              if (_child === b) {
                didFindChild = !0;
                b = parentB;
                a = parentA;
                break;
              }
              _child = _child.sibling;
            }
            if (!didFindChild)
              throw Error(
                "Child was not found in either parent set. This indicates a bug in React related to the return pointer. Please file an issue."
              );
          }
        }
        if (a.alternate !== b)
          throw Error(
            "Return fibers should always be each others' alternates. This error is likely caused by a bug in React. Please file an issue."
          );
      }
      if (3 !== a.tag)
        throw Error("Unable to find node on an unmounted component.");
      return a.stateNode.current === a ? fiber : alternate;
    }
    function findCurrentHostFiberImpl(node) {
      var tag = node.tag;
      if (5 === tag || 26 === tag || 27 === tag || 6 === tag) return node;
      for (node = node.child; null !== node; ) {
        tag = findCurrentHostFiberImpl(node);
        if (null !== tag) return tag;
        node = node.sibling;
      }
      return null;
    }
    function findCurrentHostFiberWithNoPortalsImpl(node) {
      var tag = node.tag;
      if (5 === tag || 26 === tag || 27 === tag || 6 === tag) return node;
      for (node = node.child; null !== node; ) {
        if (
          4 !== node.tag &&
          ((tag = findCurrentHostFiberWithNoPortalsImpl(node)), null !== tag)
        )
          return tag;
        node = node.sibling;
      }
      return null;
    }
    function traverseVisibleHostChildren(
      child,
      searchWithinHosts,
      fn,
      a,
      b,
      c
    ) {
      for (; null !== child; ) {
        if (
          (5 === child.tag && fn(child, a, b, c)) ||
          ((22 !== child.tag || null === child.memoizedState) &&
            (searchWithinHosts || 5 !== child.tag) &&
            traverseVisibleHostChildren(
              child.child,
              searchWithinHosts,
              fn,
              a,
              b,
              c
            ))
        )
          return !0;
        child = child.sibling;
      }
      return !1;
    }
    function getFragmentParentHostFiber(fiber) {
      for (fiber = fiber.return; null !== fiber; ) {
        if (3 === fiber.tag || 5 === fiber.tag) return fiber;
        fiber = fiber.return;
      }
      return null;
    }
    function findFragmentInstanceSiblings(result, self, child) {
      for (
        var foundSelf =
          3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : !1;
        null !== child;

      ) {
        if (child === self)
          if (((foundSelf = !0), child.sibling)) child = child.sibling;
          else return !0;
        if (5 === child.tag) {
          if (foundSelf) return (result[1] = child), !0;
          result[0] = child;
        } else if (
          (22 !== child.tag || null === child.memoizedState) &&
          findFragmentInstanceSiblings(result, self, child.child, foundSelf)
        )
          return !0;
        child = child.sibling;
      }
      return !1;
    }
    function findNextSibling(child) {
      searchTarget = child;
      return !0;
    }
    function isFiberPrecedingCheck(child, target, boundary) {
      return child === boundary
        ? !0
        : child === target
          ? ((searchTarget = child), !0)
          : !1;
    }
    function isFiberFollowingCheck(child, target, boundary) {
      return child === boundary
        ? ((searchBoundary = child), !1)
        : child === target
          ? (null !== searchBoundary && (searchTarget = child), !0)
          : !1;
    }
    function getParentForFragmentAncestors(inst) {
      if (null === inst) return null;
      do inst = null === inst ? null : inst.return;
      while (inst && 5 !== inst.tag && 27 !== inst.tag && 3 !== inst.tag);
      return inst ? inst : null;
    }
    function getLowestCommonAncestor(instA, instB, getParent) {
      for (var depthA = 0, tempA = instA; tempA; tempA = getParent(tempA))
        depthA++;
      tempA = 0;
      for (var tempB = instB; tempB; tempB = getParent(tempB)) tempA++;
      for (; 0 < depthA - tempA; ) (instA = getParent(instA)), depthA--;
      for (; 0 < tempA - depthA; ) (instB = getParent(instB)), tempA--;
      for (; depthA--; ) {
        if (instA === instB || (null !== instB && instA === instB.alternate))
          return instA;
        instA = getParent(instA);
        instB = getParent(instB);
      }
      return null;
    }
    var searchTarget = null,
      searchBoundary = null;
    exports.doesFiberContain = function (parentFiber, childFiber) {
      for (
        var parentFiberAlternate = parentFiber.alternate;
        null !== childFiber;

      ) {
        if (childFiber === parentFiber || childFiber === parentFiberAlternate)
          return !0;
        childFiber = childFiber.return;
      }
      return !1;
    };
    exports.fiberIsPortaledIntoHost = function (fiber) {
      var foundPortalParent = !1;
      for (fiber = fiber.return; null !== fiber; ) {
        4 === fiber.tag && (foundPortalParent = !0);
        if (3 === fiber.tag || 5 === fiber.tag) break;
        fiber = fiber.return;
      }
      return foundPortalParent;
    };
    exports.findCurrentFiberUsingSlowPath = findCurrentFiberUsingSlowPath;
    exports.findCurrentHostFiber = function (parent) {
      parent = findCurrentFiberUsingSlowPath(parent);
      return null !== parent ? findCurrentHostFiberImpl(parent) : null;
    };
    exports.findCurrentHostFiberWithNoPortals = function (parent) {
      parent = findCurrentFiberUsingSlowPath(parent);
      return null !== parent
        ? findCurrentHostFiberWithNoPortalsImpl(parent)
        : null;
    };
    exports.getActivityInstanceFromFiber = function (fiber) {
      if (31 === fiber.tag) {
        var activityState = fiber.memoizedState;
        null === activityState &&
          ((fiber = fiber.alternate),
          null !== fiber && (activityState = fiber.memoizedState));
        if (null !== activityState) return activityState.dehydrated;
      }
      return null;
    };
    exports.getContainerFromFiber = function (fiber) {
      return 3 === fiber.tag ? fiber.stateNode.containerInfo : null;
    };
    exports.getFragmentInstanceSiblings = function (fiber) {
      var result = [null, null],
        parentHostFiber = getFragmentParentHostFiber(fiber);
      if (null === parentHostFiber) return result;
      findFragmentInstanceSiblings(result, fiber, parentHostFiber.child);
      return result;
    };
    exports.getFragmentParentHostFiber = getFragmentParentHostFiber;
    exports.getInstanceFromHostFiber = function (fiber) {
      switch (fiber.tag) {
        case 5:
          return fiber.stateNode;
        case 3:
          return fiber.stateNode.containerInfo;
        default:
          throw Error("Expected to find a host node. This is a bug in React.");
      }
    };
    exports.getLowestCommonAncestor = getLowestCommonAncestor;
    exports.getNearestMountedFiber = getNearestMountedFiber;
    exports.getNextSiblingHostFiber = function (fiber) {
      traverseVisibleHostChildren(fiber.sibling, !1, findNextSibling);
      fiber = searchTarget;
      searchTarget = null;
      return fiber;
    };
    exports.getSuspenseInstanceFromFiber = function (fiber) {
      if (13 === fiber.tag) {
        var suspenseState = fiber.memoizedState;
        null === suspenseState &&
          ((fiber = fiber.alternate),
          null !== fiber && (suspenseState = fiber.memoizedState));
        if (null !== suspenseState) return suspenseState.dehydrated;
      }
      return null;
    };
    exports.isFiberContainedByFragment = function (fiber, fragmentFiber) {
      for (; null !== fiber; ) {
        if (
          7 === fiber.tag &&
          (fiber === fragmentFiber || fiber.alternate === fragmentFiber)
        )
          return !0;
        fiber = fiber.return;
      }
      return !1;
    };
    exports.isFiberFollowing = function (fiber, otherFiber) {
      var commonAncestor = getLowestCommonAncestor(
        fiber,
        otherFiber,
        getParentForFragmentAncestors
      );
      if (null === commonAncestor) return !1;
      traverseVisibleHostChildren(
        commonAncestor,
        !0,
        isFiberFollowingCheck,
        otherFiber,
        fiber
      );
      fiber = searchTarget;
      searchBoundary = searchTarget = null;
      return null !== fiber;
    };
    exports.isFiberPreceding = function (fiber, otherFiber) {
      var commonAncestor = getLowestCommonAncestor(
        fiber,
        otherFiber,
        getParentForFragmentAncestors
      );
      if (null === commonAncestor) return !1;
      traverseVisibleHostChildren(
        commonAncestor,
        !0,
        isFiberPrecedingCheck,
        otherFiber,
        fiber
      );
      fiber = searchTarget;
      searchTarget = null;
      return null !== fiber;
    };
    exports.isFiberSuspenseAndTimedOut = function (fiber) {
      var memoizedState = fiber.memoizedState;
      return (
        13 === fiber.tag &&
        null !== memoizedState &&
        null === memoizedState.dehydrated
      );
    };
    exports.isFragmentContainedByFiber = function (fragmentFiber) {
      var current = fragmentFiber;
      for (
        fragmentFiber = getFragmentParentHostFiber(fragmentFiber);
        null !== current;

      ) {
        if (
          !(
            (5 !== current.tag && 3 !== current.tag) ||
            (current !== fragmentFiber && current.alternate !== fragmentFiber)
          )
        )
          return !0;
        current = current.return;
      }
      return !1;
    };
    exports.traverseFragmentInstance = function (fragmentFiber, fn, a, b, c) {
      traverseVisibleHostChildren(fragmentFiber.child, !1, fn, a, b, c);
    };
    exports.traverseFragmentInstanceDeeply = function (
      fragmentFiber,
      fn,
      a,
      b,
      c
    ) {
      traverseVisibleHostChildren(fragmentFiber.child, !0, fn, a, b, c);
    };
  })();
