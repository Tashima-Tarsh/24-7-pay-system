import { HttpServer } from '../server.js';
import { IncidentRepository, SupportTicketRepository } from '@youpi/db';

/**
 * Disputes Case Management — disputes lifecycle, evidence tracking, resolution workflow.
 */
export function registerDisputesRoutes(server, ctx) {
  const db = ctx.db;
  const incidentRepo = new IncidentRepository(db);
  const ticketRepo = new SupportTicketRepository(db);

  function requireAuth(req) {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : '';
  }

  // GET /api/v1/disputes — list disputes
  server.get('/api/v1/disputes', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const status = req.query && req.query.status ? String(req.query.status) : null;
    const incidents = status ? incidentRepo.findByStatus(status) : incidentRepo.findAll();
    const tickets = ticketRepo.listByStatus ? ticketRepo.listByStatus(status || 'OPEN') : [];
    return HttpServer.json(res, 200, {
      disputes: incidents.map(i => ({ ...i, type: 'INCIDENT' })).concat(tickets.map(t => ({ ...t, type: 'TICKET' }))),
      count: incidents.length + tickets.length
    });
  });

  // POST /api/v1/disputes — create dispute case
  server.post('/api/v1/disputes', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { title, description, severity, category, merchantId, paymentId, orderId, createdBy } = body;
    if (!title || !description) return HttpServer.json(res, 400, { error: 'title and description required' });
    const incident = incidentRepo.createIncident({
      title, description, severity, category, merchantId,
      createdBy: createdBy || 'system',
      timeline: JSON.stringify([{ event: 'CREATED', at: new Date().toISOString(), by: createdBy || 'system' }])
    });
    return HttpServer.json(res, 201, { dispute: incident });
  });

  // GET /api/v1/disputes/:id — get dispute detail
  server.get('/api/v1/disputes/:id', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    const incident = incidentRepo.findIncidentById(params.id);
    if (!incident) return HttpServer.json(res, 404, { error: 'Dispute not found' });
    return HttpServer.json(res, 200, { dispute: incident });
  });

  // PATCH /api/v1/disputes/:id — update dispute
  server.patch('/api/v1/disputes/:id', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const incident = incidentRepo.updateIncident(params.id, body);
    if (!incident) return HttpServer.json(res, 404, { error: 'Dispute not found' });
    return HttpServer.json(res, 200, { dispute: incident });
  });

  // POST /api/v1/disputes/:id/evidence — add evidence
  server.post('/api/v1/disputes/:id/evidence', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { evidenceType, evidenceUrl, description, addedBy } = body;
    const incident = incidentRepo.findIncidentById(params.id);
    if (!incident) return HttpServer.json(res, 404, { error: 'Dispute not found' });
    const timeline = incident.timeline ? JSON.parse(incident.timeline) : [];
    timeline.push({
      event: 'EVIDENCE_ADDED',
      at: new Date().toISOString(),
      by: addedBy || 'system',
      details: { evidenceType, evidenceUrl, description }
    });
    incidentRepo.updateIncident(params.id, { timeline: JSON.stringify(timeline) });
    return HttpServer.json(res, 200, { evidenceAdded: true, timeline });
  });

  // POST /api/v1/disputes/:id/resolve — resolve dispute
  server.post('/api/v1/disputes/:id/resolve', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });
    let body;
    try { body = await HttpServer.parseBody(req); } catch { return HttpServer.json(res, 400, { error: 'Malformed body' }); }
    const { resolution, resolvedBy, resolutionNotes } = body;
    if (!resolution) return HttpServer.json(res, 400, { error: 'resolution required' });
    const timeline = incidentRepo.findIncidentById(params.id)?.timeline ? JSON.parse(incidentRepo.findIncidentById(params.id).timeline) : [];
    timeline.push({
      event: 'RESOLVED',
      at: new Date().toISOString(),
      by: resolvedBy || 'system',
      details: { resolution, resolutionNotes }
    });
    const incident = incidentRepo.updateIncident(params.id, {
      status: 'RESOLVED',
      resolutionNotes: resolutionNotes || resolution,
      resolvedAt: new Date().toISOString(),
      timeline: JSON.stringify(timeline)
    });
    if (!incident) return HttpServer.json(res, 404, { error: 'Dispute not found' });
    return HttpServer.json(res, 200, { dispute: incident, resolved: true });
  });
}
