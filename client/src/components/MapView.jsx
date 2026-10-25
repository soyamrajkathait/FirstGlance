import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { getNodeType, CAMPUS_CENTER, CAMPUS_ZOOM } from '../utils/mapData';
import './MapView.css';

// Fix default Leaflet icon path issue with bundlers
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ───────────────── SVG Marker Factory ─────────────────
function createSvgIcon(color, size = 26, pulse = false) {
  const html = `
    <div class="custom-marker ${
      pulse ? 'custom-marker--pulse' : ''
    }" style="--mc:${color};">
      <div class="custom-marker__dot"></div>
      ${pulse ? '<div class="custom-marker__ring"></div>' : ''}
    </div>
  `;

  return L.divIcon({
    html,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 6)],
  });
}

const TYPE_COLORS = {
  gate: '#c9a84c',
  building: '#60a5fa',
  hostel: '#a78bfa',
  cafeteria: '#f97316',
  sports: '#34d399',
  lab: '#e879f9',
  library: '#fbbf24',
  other: '#9ca3af',
};

function getMarkerColor(type) {
  return TYPE_COLORS[type] || TYPE_COLORS.other;
}

// ───────────────── Popup Builder ─────────────────
function buildPopupHtml(name, node, hasSource) {
  const type = node.type || getNodeType(name);

  const btnLabel = hasSource
    ? 'Set as Destination'
    : 'Set as Source';

  const btnClass = hasSource
    ? 'popup-btn popup-btn--dest'
    : 'popup-btn popup-btn--source';

  return `
    <div class="popup-content">
      <div class="popup-type">${type.toUpperCase()}</div>
      <div class="popup-name">${name}</div>

      ${
        node.description
          ? `<div class="popup-desc">${node.description}</div>`
          : ''
      }

      <div class="popup-actions">
        <button
          class="${btnClass}"
          data-node="${name}"
          data-action="${hasSource ? 'dest' : 'source'}"
        >
          ${hasSource ? '🏁' : '📍'} ${btnLabel}
        </button>

        ${
          hasSource
            ? `
          <button
            class="popup-btn popup-btn--swap"
            data-node="${name}"
            data-action="source"
          >
            🔄 Set as Source instead
          </button>
        `
            : ''
        }
      </div>
    </div>
  `;
}

export default function MapView({
  nodes,
  source,
  destination,
  pathCoords,
  highlightedNode,
  userLocation,
  onSetSource,
  onSetDestination,
  onMapClick,
  hasSource,
}) {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);

  const markersRef = useRef({});
  const pathLayerRef = useRef(null);
  const userMarkerRef = useRef(null);

  // Latest callback refs
  const onSetSourceRef = useRef(onSetSource);
  const onSetDestinationRef = useRef(onSetDestination);
  const onMapClickRef = useRef(onMapClick);
  const hasSourceRef = useRef(hasSource);
  const nodesRef = useRef(nodes);

  useEffect(() => {
    onSetSourceRef.current = onSetSource;
  }, [onSetSource]);

  useEffect(() => {
    onSetDestinationRef.current = onSetDestination;
  }, [onSetDestination]);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    hasSourceRef.current = hasSource;
  }, [hasSource]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // ───────────────── Initialize Map ─────────────────
  useEffect(() => {
    if (leafletMap.current) return;

    const map = L.map(mapRef.current, {
      center: CAMPUS_CENTER,
      zoom: CAMPUS_ZOOM,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 20,
      }
    ).addTo(map);

    // Empty click reset
    map.on('click', () => {
      onMapClickRef.current();
    });

    // Popup button delegation
    mapRef.current.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');

      if (!btn) return;

      e.stopPropagation();

      const name = btn.dataset.node;
      const action = btn.dataset.action;

      map.closePopup();

      if (action === 'source') {
        onSetSourceRef.current(name);
      } else {
        onSetDestinationRef.current(name);
      }
    });

    leafletMap.current = map;

    return () => {
      map.remove();
      leafletMap.current = null;
    };
  }, []);

  // ───────────────── Build Markers ─────────────────
  useEffect(() => {
    if (
      !leafletMap.current ||
      !nodes ||
      Object.keys(nodes).length === 0
    ) {
      return;
    }

    // Remove old markers
    Object.values(markersRef.current).forEach((m) => {
      m.remove();
    });

    markersRef.current = {};

    const displayNodes = Object.keys(nodes).filter(
      (n) => !n.startsWith('Road Point')
    );

    displayNodes.forEach((name) => {
      const node = nodes[name];

      // SAFE CHECK
      if (
        !node ||
        typeof node.lat !== 'number' ||
        typeof node.lng !== 'number'
      ) {
        console.error('Invalid node skipped:', name, node);
        return;
      }

      const type = node.type || getNodeType(name);

      const color = getMarkerColor(type);

      const icon = createSvgIcon(color, 24);

      const marker = L.marker(
        [node.lat, node.lng],
        { icon }
      )
        .addTo(leafletMap.current)
        .bindPopup('', {
          maxWidth: 260,
          className: 'fg-popup',
        });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);

        const html = buildPopupHtml(
          name,
          node,
          hasSourceRef.current
        );

        marker
          .getPopup()
          .setContent(html)
          .openOn(leafletMap.current);
      });

      markersRef.current[name] = marker;
    });
  }, [nodes]);

  // ───────────────── Marker Updates ─────────────────
  useEffect(() => {
    if (!nodes) return;

    Object.entries(markersRef.current).forEach(
      ([name, marker]) => {
        const node = nodes[name] || {};

        const type =
          node.type || getNodeType(name);

        // SOURCE
        if (name === source) {
          marker.setIcon(
            createSvgIcon('#3ecf8e', 34)
          );

          marker.setZIndexOffset(1000);
        }

        // DESTINATION
        else if (name === destination) {
          marker.setIcon(
            createSvgIcon('#f05252', 34)
          );

          marker.setZIndexOffset(1000);
        }

        // HIGHLIGHTED SEARCH/SIDEBAR NODE
        else if (name === highlightedNode) {
          marker.setIcon(
            createSvgIcon('#f6e05e', 30)
          );

          marker.setZIndexOffset(900);

          const selectedNode = nodes[name];

          // CRITICAL FIX
          if (
            leafletMap.current &&
            selectedNode &&
            typeof selectedNode.lat === 'number' &&
            typeof selectedNode.lng === 'number'
          ) {
            leafletMap.current.setView(
              [
                selectedNode.lat,
                selectedNode.lng,
              ],
              18,
              {
                animate: true,
              }
            );

            const html = buildPopupHtml(
              name,
              node,
              hasSourceRef.current
            );

            marker
              .getPopup()
              .setContent(html)
              .openOn(leafletMap.current);
          } else {
            console.error(
              'Invalid highlighted node:',
              name,
              selectedNode
            );
          }
        }

        // NORMAL
        else {
          marker.setIcon(
            createSvgIcon(
              getMarkerColor(type),
              24
            )
          );

          marker.setZIndexOffset(0);
        }
      }
    );
  }, [
    source,
    destination,
    highlightedNode,
    nodes,
  ]);

  // ───────────────── Popup Refresh ─────────────────
  useEffect(() => {
    if (!leafletMap.current) return;

    const openPopup =
      leafletMap.current._popup;

    if (!openPopup) return;

    const entry = Object.entries(
      markersRef.current
    ).find(
      ([, m]) => m.getPopup() === openPopup
    );

    if (!entry) return;

    const [name] = entry;

    const node = nodesRef.current[name];

    if (!node) return;

    openPopup.setContent(
      buildPopupHtml(name, node, hasSource)
    );
  }, [hasSource]);

  // ───────────────── Path Drawing ─────────────────
  useEffect(() => {
    if (!leafletMap.current) return;

    if (pathLayerRef.current) {
      pathLayerRef.current.remove();
      pathLayerRef.current = null;
    }

    if (
      pathCoords &&
      Array.isArray(pathCoords) &&
      pathCoords.length > 1
    ) {
      const validCoords = pathCoords.filter(
        (coord) =>
          Array.isArray(coord) &&
          coord.length === 2 &&
          typeof coord[0] === 'number' &&
          typeof coord[1] === 'number'
      );

      if (validCoords.length > 1) {
        const polyline = L.polyline(
          validCoords,
          {
            color: '#3ecf8e',
            weight: 5,
            opacity: 0.92,
            dashArray: '10, 6',
            lineCap: 'round',
            lineJoin: 'round',
            className: 'animated-path',
          }
        ).addTo(leafletMap.current);

        pathLayerRef.current = polyline;

        leafletMap.current.fitBounds(
          polyline.getBounds(),
          {
            padding: [70, 70],
          }
        );
      }
    }
  }, [pathCoords]);

  // ───────────────── User Location ─────────────────
  useEffect(() => {
    if (
      !leafletMap.current ||
      !userLocation ||
      typeof userLocation.lat !== 'number' ||
      typeof userLocation.lng !== 'number'
    ) {
      return;
    }

    const icon = createSvgIcon(
      '#9f7aea',
      30,
      true
    );

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([
        userLocation.lat,
        userLocation.lng,
      ]);

      userMarkerRef.current.setIcon(icon);
    } else {
      userMarkerRef.current = L.marker(
        [
          userLocation.lat,
          userLocation.lng,
        ],
        { icon }
      )
        .addTo(leafletMap.current)
        .bindPopup(`
          <div class="popup-content">
            <div class="popup-name">
              📍 You are here
            </div>
          </div>
        `);
    }
  }, [userLocation]);

  return (
    <div
      ref={mapRef}
      className="map-view"
    />
  );
}