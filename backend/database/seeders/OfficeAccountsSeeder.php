<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * The nine accounts and nothing else.
 *
 * DatabaseSeeder builds a whole demonstration barangay — households,
 * residents, certificates, cases, chat threads — which is right for showing
 * the system and wrong for handing it over. This is the other seeder: the
 * offices can sign in, and every register is empty and waiting for real
 * entries.
 *
 *     php artisan migrate:fresh --seed --seeder=Database\Seeders\OfficeAccountsSeeder
 *
 * The list is copied from DatabaseSeeder rather than shared with it, and
 * deliberately: that one is free to grow demonstration staff without those
 * people appearing on a live barangay's account screen.
 */
class OfficeAccountsSeeder extends Seeder
{
    public function run(): void
    {
        $rows = [
            ['Hon. Ricardo M. Balagtas', 'pb@natumolan.local', 'Punong Barangay', 'Main Office'],
            ['Liezel A. Fernandez', 'secretary@natumolan.local', 'Secretary', 'Main Office'],
            ['Marco T. Villarin', 'clerk@natumolan.local', 'Clerk', 'Main Office'],
            ['Maria Lourdes P. Santos', 'vawc@natumolan.local', 'VAWC Officer', 'VAWC'],
            ['Ernesto D. Villanueva', 'lupon@natumolan.local', 'Lupon Secretary', 'Lupon'],
            ['Allan T. Mercado', 'population@natumolan.local', 'Population Worker', 'Population'],
            ['Angelica R. Cruz', 'health@natumolan.local', 'Health Personnel', 'Health Station'],
            ['Hon. Kyla Marie D. Torres', 'sk@natumolan.local', 'SK Chairperson', 'SK'],
            ['System Administrator', 'admin@natumolan.local', 'Admin', 'Admin'],
        ];

        foreach ($rows as [$name, $email, $role, $office]) {
            /*
             * updateOrCreate, so running this on an existing database tops up
             * a missing office rather than colliding on the unique email.
             */
            User::updateOrCreate(
                ['email' => $email],
                [
                    'name' => $name,
                    'password' => 'password',
                    'role' => $role,
                    'office' => $office,
                    'is_active' => true,
                    /*
                     * Activated on creation. The emailed code proves a mailbox
                     * belongs to its owner, and a staff account is issued by
                     * hand to somebody standing in the office — the counter
                     * has already proved it.
                     */
                    'activated_at' => now(),
                ],
            );
        }

        $this->command?->warn(
            'Every account has the password "password". Change all nine before this is used for real.'
        );
    }
}
