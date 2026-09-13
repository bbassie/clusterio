import assert from "node:assert/strict";
import * as lib from "@clusterio/lib";
import { ControlConnection } from "@clusterio/controller";
import * as mock from "../mock.js";

describe("controller/src/ControlConnection", function() {
	describe(".handleControllerRestartRequest()", function() {
		let mockController;

		beforeEach(function() {
			mockController = {
				canRestart: true,
				shouldRestart: false,
				stopped: false,
				async checkRestartDowngrade() { return null; },
				stop() { this.stopped = true; },
			};
		});

		async function restart() {
			await ControlConnection.prototype.handleControllerRestartRequest.call({
				_controller: mockController,
			});
		}

		it("restarts when the installed version is not older", async function() {
			await restart();
			assert.equal(mockController.shouldRestart, true);
			assert.equal(mockController.stopped, true);
		});

		it("rejects a downgrade without stopping the controller", async function() {
			mockController.checkRestartDowngrade = async () => ({
				installedVersion: "1.0.0",
				runningVersion: "2.0.0",
			});

			await assert.rejects(restart, /Stop the controller before starting the older version manually/);
			assert.equal(mockController.shouldRestart, false);
			assert.equal(mockController.stopped, false);
		});
	});

	describe(".handleUserDeleteRequest()", function() {
		let mockController;
		let nextId;

		beforeEach(function() {
			mockController = new mock.MockController();
			mockController.sendTo = () => {};
			mockController.wsServer.controlConnections = new Map();
			nextId = 1;
		});

		function connect(name) {
			const connection = {
				_controller: mockController,
				user: mockController.users.getByName(name),
				connector: {
					terminated: false,
					terminate() { this.terminated = true; },
				},
			};
			mockController.wsServer.controlConnections.set(nextId, connection);
			nextId += 1;
			return connection;
		}

		async function deleteUser(connection, name) {
			await ControlConnection.prototype.handleUserDeleteRequest.call(
				connection, new lib.UserDeleteRequest(name)
			);
		}

		it("terminates connections of the deleted user", async function() {
			const admin = connect("test");
			const player1 = connect("player");
			const player2 = connect("player");

			await deleteUser(admin, "player");
			assert.equal(mockController.users.getByName("player"), undefined);
			assert.equal(player1.connector.terminated, true);
			assert.equal(player2.connector.terminated, true);
			assert.equal(admin.connector.terminated, false);
		});

		it("terminates its own connection after the handler returns", async function() {
			const player = connect("player");

			await deleteUser(player, "player");
			assert.equal(player.connector.terminated, false);
			await new Promise(resolve => setImmediate(resolve));
			assert.equal(player.connector.terminated, true);
		});
	});
});
