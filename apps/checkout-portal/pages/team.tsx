/**
 * Team Page — Phase 7: Team Management
 *
 * Manage team members and their permissions.
 */

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge, Input } from '@youpi/ui';
import { Dialog } from '@radix-ui/react-dialog';
import { api } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { User, Plus } from 'lucide-react';

export default function TeamPage() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', email: '', role: 'VIEWER' });
  const { toast } = useToast();

  const { data: team } = useQuery({
    queryKey: ['team'],
    queryFn: () => api.getTeamMembers(),
  });

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.addTeamMember(newMember);
      queryClient.invalidateQueries({ queryKey: ['team'] });
      setNewMember({ name: '', email: '', role: 'VIEWER' });
      setShowAddModal(false);
      toast.success('Team member added');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Team</h2>
          <p className="text-neutral-400 text-sm">
            Manage team members and their roles
          </p>
        </div>
        <Button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Member
        </Button>
      </div>

      <Card>
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-neutral-400 uppercase bg-neutral-800">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {team?.map((member: any) => (
                  <tr key={member.id} className="flex flex-col gap-2 p-4 rounded-lg bg-neutral-800 hover:bg-neutral-800/50 cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white font-bold text-sm">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <p className="text-neutral-100 font-medium">{member.name}</p>
                          <p className="text-xs text-neutral-500">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={member.role === 'ADMIN' ? 'default' : 'success'}>
                        {member.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="success">Active</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <div className="p-6 space-y-4">
          <h2 className="text-xl font-bold text-white">Add Team Member</h2>
          <form onSubmit={addMember} className="space-y-4">
            <div className="space-y-3">
              <label className="text-sm font-medium text-neutral-400">Full Name</label>
              <Input
                type="text"
                value={newMember.name}
                onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                placeholder="John Doe"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium text-neutral-400">Email</label>
              <Input
                type="email"
                value={newMember.email}
                onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                placeholder="john@company.com"
                className="w-full bg-neutral-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium text-neutral-400">Role</label>
              <Input
                type="text"
                value={newMember.role}
                onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                placeholder="VIEWER / ADMIN"
                className="w-full bg-neutral-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary-600 hover:bg-primary-700 text-white">
                Add Member
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
    </div>
  );
}
